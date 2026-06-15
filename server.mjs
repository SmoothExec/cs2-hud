// CS2 HUD — local server for Windows.
//
// CS2's Game State Integration (Valve-official, VAC-safe) POSTs your live game
// state to this server; the server parses out the HUD fields and streams a
// compact object over SSE to the Even G2 glasses, and also serves the glasses
// WebView itself. Everything runs on YOUR PC over your LAN — no cloud, no tailnet.
//
//   CS2  ──POST /gsi──►  this server  ──SSE /stream──►  G2 glasses
//                        (also serves the HUD WebView at  /  )
//
// Run:  node server.mjs        (or double-click start.bat)
// Pure Node stdlib, no dependencies.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.CS2_PORT || 4840)
// Optional shared token — must match the `auth { token }` in the .cfg. Empty = off.
const TOKEN = String(process.env.CS2_TOKEN || 'swarm-cs2').trim()
const PUBLIC = path.join(__dirname, 'public')

let last = { connected: false }
const sseClients = new Set()

// ---- CS2 link diagnostics ---------------------------------------------------
// CS2 is a black box: it never tells you if its GSI POSTs are landing. So we
// surface it here — first contact, auth rejections, and a periodic heartbeat —
// which turns "is the cfg working?" from a guess into something you can watch.
let gsiSeen = false
let gsiCount = 0
let lastGsiLog = 0
let lastAuthWarn = 0

function sseBroadcast(obj) {
  const payload = `data: ${JSON.stringify(obj)}\n\n`
  for (const res of sseClients) {
    try { res.write(payload) } catch { try { res.end() } catch {} ; sseClients.delete(res) }
  }
}

// ---- GSI parsing: raw CS2 payload -> compact HUD object ---------------------
const NADE = {
  weapon_hegrenade: 'HE', weapon_flashbang: 'FB', weapon_smokegrenade: 'SM',
  weapon_molotov: 'MOL', weapon_incgrenade: 'INC', weapon_decoy: 'DEC',
}
function parseGsi(g) {
  const p = g && g.player
  if (!p || !p.state) return { connected: true, alive: false, inGame: false }
  const s = p.state
  const weapons = p.weapons || {}
  let active = null
  const nades = []
  let carryingBomb = false
  for (const k of Object.keys(weapons)) {
    const w = weapons[k]
    if (!w || !w.name) continue
    if (w.type === 'C4') carryingBomb = true
    if (w.type === 'Grenade') nades.push(NADE[w.name] || w.name.replace('weapon_', '').slice(0, 3).toUpperCase())
    if (w.state === 'active') active = w
  }
  const weaponName = active ? String(active.name || '').replace('weapon_', '').toUpperCase() : ''
  const bombNode = g.bomb || {}
  const roundBomb = (g.round && g.round.bomb) || ''
  const bomb = bombNode.state || roundBomb || ''
  let bombTimer = null
  const pc = g.phase_countdowns
  if (pc && pc.phase_ends_in != null) bombTimer = parseFloat(pc.phase_ends_in)
  if (bombTimer == null && bombNode.countdown != null) bombTimer = parseFloat(bombNode.countdown)
  const map = g.map || {}
  const ms = p.match_stats || {}
  // World-space position/heading for the minimap (only present when the cfg
  // enables "player_position"). CS2 sends these as "x, y, z" strings.
  const vec = (str) => {
    if (typeof str !== 'string') return null
    const a = str.split(',').map((n) => parseFloat(n.trim()))
    return a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1]) ? { x: a[0], y: a[1], z: a[2] || 0 } : null
  }
  return {
    connected: true,
    inGame: true,
    alive: (s.health | 0) > 0,
    hp: s.health | 0,
    armor: s.armor | 0,
    helmet: !!s.helmet,
    kit: !!s.defusekit,
    team: p.team || '',
    weapon: weaponName,
    clip: active && active.ammo_clip != null ? active.ammo_clip : null,
    reserve: active && active.ammo_reserve != null ? active.ammo_reserve : null,
    nades,
    carryingBomb,
    bomb,
    bombTimer: Number.isFinite(bombTimer) ? bombTimer : null,
    money: s.money | 0,
    kills: ms.kills != null ? ms.kills | 0 : null,
    deaths: ms.deaths != null ? ms.deaths | 0 : null,
    assists: ms.assists != null ? ms.assists | 0 : null,
    roundKills: s.round_kills | 0,
    roundPhase: (g.round && g.round.phase) || (map.phase || ''),
    ctScore: map.team_ct && map.team_ct.score != null ? map.team_ct.score : null,
    tScore: map.team_t && map.team_t.score != null ? map.team_t.score : null,
    map: map.name || '',
    pos: vec(p.position),
    fwd: vec(p.forward),
    bombPos: vec(bombNode.position),
    ts: Date.now(),
  }
}

// ---- static file serving (the HUD WebView) ---------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const fp = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(buf)
  })
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => { n += c.length; if (n < 4 * 1024 * 1024) chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(Buffer.alloc(0)))
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  // CORS for the WebView (loaded from the same origin, but be permissive).
  res.setHeader('Access-Control-Allow-Origin', '*')

  // CS2 posts game state here.
  if (req.method === 'POST' && url.pathname === '/gsi') {
    const raw = await readBody(req)
    let g = null
    try { g = JSON.parse(raw.toString('utf8') || '{}') } catch {}
    if (TOKEN && !(g && g.auth && g.auth.token === TOKEN)) {
      const now = Date.now()
      if (now - lastAuthWarn > 3000) {
        lastAuthWarn = now
        const got = g && g.auth ? JSON.stringify(g.auth.token) : '(none)'
        console.log(`  [!] CS2 reached the server but its auth token was rejected.`)
        console.log(`      cfg sent ${got}, server expects "${TOKEN}". Make the cfg's auth.token match (or set CS2_TOKEN).`)
      }
      res.writeHead(403); res.end(); return
    }
    if (g) {
      gsiCount++
      const now = Date.now()
      if (!gsiSeen) {
        gsiSeen = true
        console.log(`\n  [OK] CS2 connected -- game state is flowing in (from ${req.socket.remoteAddress}).`)
      } else if (now - lastGsiLog > 15000) {
        lastGsiLog = now
        console.log(`  …CS2 live: ${gsiCount} updates received (latest: ${last.inGame ? `in-game hp=${last.hp}` : 'in menu / no active match'})`)
      }
      last = parseGsi(g); sseBroadcast(last)
    }
    res.writeHead(200); res.end('ok')
    return
  }

  // Glasses subscribe here.
  if (req.method === 'GET' && url.pathname === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write('retry: 2000\n\n')
    sseClients.add(res)
    res.write(`data: ${JSON.stringify(last)}\n\n`)
    const ka = setInterval(() => { try { res.write(`event: ping\ndata: ${Date.now()}\n\n`) } catch {} }, 10000)
    req.on('close', () => { clearInterval(ka); sseClients.delete(res) })
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, sseClients: sseClients.size, last }))
    return
  }

  if (req.method === 'GET') { serveStatic(req, res); return }
  res.writeHead(404); res.end('not found')
})

server.on('error', (e) => { console.error('server error:', e.message); if (e.code === 'EADDRINUSE') process.exit(1) })
process.on('uncaughtException', (e) => console.error('uncaught:', e.message))

// True if an interface looks like a VPN / virtual / link-local adapter rather
// than the real LAN the glasses live on (NordVPN, WireGuard, WSL, Hyper-V, …).
const VIRTUAL_IFACE = /nord|vpn|wg|wireguard|tailscale|zerotier|hyper-v|vethernet|virtual|vmware|vbox|loopback|wsl|docker/i
function lanUrls() {
  const out = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_IFACE.test(name)) continue
    for (const n of addrs || []) {
      if (!n || n.family !== 'IPv4' || n.internal) continue
      if (n.address.startsWith('169.254.')) continue // link-local (no DHCP)
      out.push(n.address)
    }
  }
  // Prefer ordinary home-LAN ranges (192.168.x, 10.x, 172.16–31.x) first.
  const isPrivate = (ip) => /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  return out.sort((a, b) => (isPrivate(b) - isPrivate(a)))
}

server.listen(PORT, '0.0.0.0', () => {
  const urls = lanUrls()
  console.log(`\n  CS2 HUD running on port ${PORT}`)
  console.log(`  CS2 config 'uri' should be:  http://127.0.0.1:${PORT}/gsi`)
  console.log(`  Load the HUD on your glasses at this LAN URL:`)
  if (urls.length) for (const ip of urls) console.log(`      http://${ip}:${PORT}/`)
  else console.log(`      (no LAN address found -- check your network connection)`)
  console.log(`\n  Waiting for CS2...  (you'll see "[OK] CS2 connected" here once GSI data arrives;`)
  console.log(`  GSI only sends during an ACTIVE match, not in the main menu.)\n`)
})
