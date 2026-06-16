CS2 HUD  -  your Counter-Strike 2 HUD on Even Realities G2 glasses
==================================================================

Shows your health, armor, ammo, grenades, money, score, K/D and bomb status
on the glasses while you play. It uses Valve's official Game State Integration
(GSI), the same read-only feed that powers pro broadcast overlays. It only ever
sees YOUR OWN data (never enemy info), runs entirely on your PC + LAN, and will
NOT get you VAC-banned. No memory reading, no injection, no cloud.

How it works:
  CS2  --POST your game state-->  this server (your PC)  --LAN-->  G2 glasses

This download is the PC-side server. The glasses app itself ("CS2 HUD") is
installed on your glasses from Even Hub.

----------------------------------------------------------------------
ONE-TIME SETUP
----------------------------------------------------------------------

1) Install Node.js (LTS) if you don't have it:  https://nodejs.org

2) Install the CS2 config:
   Copy  gamestate_integration_glasses.cfg  into your CS2 cfg folder:
     ...\Counter-Strike Global Offensive\game\csgo\cfg\
   (In Steam, right-click CS2 > Manage > Browse local files, then open
    game\csgo\cfg. If you have more than one Steam library, use this so the
    file lands in the install that actually runs.) The filename MUST start
    with "gamestate_integration_".

3) FULLY RESTART CS2 after copying the config. GSI configs are only read when
   the game starts up.

4) Make sure your PC and the glasses' phone are on the SAME Wi-Fi / LAN.

----------------------------------------------------------------------
EACH TIME YOU PLAY
----------------------------------------------------------------------

1) Double-click  start.bat  (or run:  node server.mjs ).
   It prints the LAN URL to use on the glasses, e.g.:
       http://192.168.1.50:4840/

2) Open the CS2 HUD app on your glasses. The HUD appears once a match starts.

3) Launch CS2 and play. HP / armor / ammo / grenades / score / bomb update live.

Tip: open the printed URL in a desktop browser to confirm data is flowing
(you'll see "[OK] CS2 connected" in the server window once CS2 reaches it).

----------------------------------------------------------------------
OPTIONAL: AUTO-START THE SERVER WHEN YOU LAUNCH CS2
----------------------------------------------------------------------

So you never have to remember to run start.bat:

1) Double-click  setup-autostart.bat . It prints one line, like:
     "C:\...\launch-with-cs2.bat" %command%
2) In Steam, right-click Counter-Strike 2 > Properties > Launch Options,
   and paste that line in.
3) Done. Press Play on CS2 as normal - the HUD server starts with the
   game and shuts down when you quit. (A duplicate launch is harmless;
   the extra copy just exits because the port is already in use.)

To undo: clear the CS2 launch options box.

----------------------------------------------------------------------
OPTIONAL: HIDE THE ON-SCREEN HUD
----------------------------------------------------------------------

Your HP / ammo / money / score are on the glasses now, so you can hide
CS2's on-screen HUD.

1) Copy  hide-hud.cfg  into your CS2 cfg folder (same place as the
   gamestate_integration_glasses.cfg).
2) In the CS2 console, type:  exec hide-hud

Two options inside the file (pick one):
  A) Hide the HUD but KEEP the radar/minimap (active by default).
  B) Disable the ENTIRE HUD, kill feed only, no radar
     (cl_draw_only_deathnotices 1).

Press P to toggle the HUD back, or restore with cl_drawhud 1 (Option A)
or cl_draw_only_deathnotices 0 (Option B).

Heads-up: these are gated by sv_cheats, so they apply on practice,
offline-with-bots, and community servers. Official matchmaking may keep
the on-screen HUD on. Hiding your own HUD is a visual preference, not a
cheat; Valve just gates the command.

----------------------------------------------------------------------
NOTES
----------------------------------------------------------------------

- Default port is 4840. To change it, set CS2_PORT (e.g. set CS2_PORT=5000)
  and update the "uri" port in the .cfg to match.
- The "auth token" in the .cfg ("swarm-cs2") just stops random requests; you
  can change it, but also change CS2_TOKEN to match (set CS2_TOKEN=...).
- Windows Firewall may ask to allow Node the first time - allow it on private
  networks so the glasses can reach the server.
- CS2 has no Mac build, so this runs on your Windows PC; the glasses reach it
  over your LAN. Nothing leaves your network.
- Not affiliated with Valve or Even Realities.
