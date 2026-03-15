import type { GameEngine } from "@/lib/game-engine";

export type TemplateCategory =
  | "classic-arcade"
  | "platformer"
  | "puzzle"
  | "strategy"
  | "action"
  | "io-arena"
  | "3d";

export interface GameTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: TemplateCategory;
  readonly engine: GameEngine;
  readonly starterPrompt: string;
  readonly skills: string;
}

export const TEMPLATE_CATEGORIES: readonly { id: TemplateCategory; label: string }[] = [
  { id: "classic-arcade", label: "Arcade" },
  { id: "platformer", label: "Platformer" },
  { id: "puzzle", label: "Puzzle" },
  { id: "strategy", label: "Strategy" },
  { id: "action", label: "Action" },
  { id: "io-arena", label: ".io" },
  { id: "3d", label: "3D" },
] as const;

export const GAME_TEMPLATES: readonly GameTemplate[] = [
  // ── Classic Arcade ──
  {
    id: "space-shooter",
    name: "Space Shooter",
    description: "Top-down vertical scrolling shooter",
    category: "classic-arcade",
    engine: "canvas2d",
    starterPrompt:
      "Create a space shooter game with a player ship at the bottom, waves of enemy formations scrolling down, power-ups (spread shot, shield, speed boost), a scrolling starfield background, and a combo scoring system.",
    skills: `Space Shooter Genre Guidelines:
- Use a scrolling starfield background with multiple parallax layers (3+ layers at different speeds).
- Player ship: constant horizontal movement, auto-fire or hold-to-fire. Limit fire rate with a cooldown timer.
- Enemy waves: define formation patterns (V-shape, grid, sine-wave). Spawn waves on a timer. Each wave should have a brief "warning" indicator.
- Collision detection: circle-circle for bullets vs enemies, AABB for player vs pickups. Use spatial partitioning if entity count > 100.
- Power-up system: dropped by destroyed enemies (10-15% chance). Types: spread shot (3-5 bullets in a fan), shield (absorbs 1 hit), speed boost (1.5x movement).
- Particle effects: explosion burst (20-30 particles, radial velocity, fade over 0.5s), thruster trail behind player ship.
- Scoring: base points per enemy, combo multiplier that increases with rapid kills and decays after 2s idle. Display combo text briefly.
- Boss fights every 5 waves: large enemy with health bar, multiple attack patterns (bullet spread, charge attack).
- Screen shake on explosions (translate canvas 2-4px for 0.1s).`,
  },
  {
    id: "brick-breaker",
    name: "Brick Breaker",
    description: "Ball-and-paddle brick destruction",
    category: "classic-arcade",
    engine: "canvas2d",
    starterPrompt:
      "Create a brick breaker game with a paddle at the bottom, a bouncing ball, colorful brick rows with different hit points, power-ups (multi-ball, wider paddle, fireball), and level progression.",
    skills: `Brick Breaker Genre Guidelines:
- Ball physics: velocity vector (vx, vy). Reflect on wall/paddle/brick collision. Normalize speed after reflection to prevent acceleration: magnitude = Math.sqrt(vx*vx + vy*vy); vx = (vx/magnitude)*speed; vy = (vy/magnitude)*speed.
- Paddle collision: adjust ball angle based on hit position. offset = (ballX - paddleCenter) / (paddleWidth/2); angle = offset * maxAngle (60-75 degrees). Convert angle to vx/vy.
- Brick grid: rows x columns. Each brick has hitPoints (1-3) and a color per HP level. Use AABB collision. Determine which face was hit (compare overlap on each axis) for correct bounce direction.
- Power-ups: fall from destroyed bricks (15-20% chance). Multi-ball: clone current ball with slightly altered angle. Wide paddle: increase width by 50% for 10s. Fireball: ball destroys all bricks in path for 8s.
- Level progression: increase brick rows, add indestructible bricks, increase ball speed by 5-10% per level.
- Particle burst on brick destruction (8-12 particles in brick's color).
- Ball trail: render 5-8 previous positions with decreasing opacity.
- Launch mechanic: ball starts on paddle, player clicks to launch at 60-80 degree angle.`,
  },
  {
    id: "snake",
    name: "Snake",
    description: "Classic snake growing mechanic",
    category: "classic-arcade",
    engine: "canvas2d",
    starterPrompt:
      "Create a classic snake game on a grid, with smooth movement, food spawning, growing tail, score counter, increasing speed, and a game over screen when hitting walls or self.",
    skills: `Snake Genre Guidelines:
- Grid-based movement: store snake as array of {x, y} segments. Head is segments[0]. Move by unshifting new head position, popping tail (unless food eaten).
- Tick-based update: use a move interval (start ~150ms, decrease by 5ms per food eaten, minimum 60ms). Accumulate dt and step when interval elapsed.
- Direction queue: buffer up to 2 direction inputs to prevent 180-degree reversal on fast key presses. Validate: new direction must not be opposite of current.
- Food placement: random grid cell not occupied by snake. Use a Set of occupied cells for O(1) lookup.
- Collision: check if new head overlaps any body segment or is out of bounds.
- Visual polish: draw snake segments as rounded rectangles with slight gaps. Head segment slightly larger or differently colored. Food pulses (scale oscillation using sin(time)).
- Smooth rendering: interpolate between grid positions using fractional progress within the tick interval for fluid movement.
- Score display: current score and high score (stored in localStorage).
- Grid lines: subtle dotted grid overlay for spatial reference.`,
  },
  {
    id: "pacman-style",
    name: "Pac-Man Style",
    description: "Maze chase with AI ghosts",
    category: "classic-arcade",
    engine: "canvas2d",
    starterPrompt:
      "Create a Pac-Man style maze game with a player navigating corridors, eating dots, 4 ghosts with different AI behaviors, power pellets that let you eat ghosts, and level progression.",
    skills: `Pac-Man Style Genre Guidelines:
- Tile-based maze: 2D array where 0=path, 1=wall. Player and ghosts move tile-to-tile. Use 20-28 column mazes. Render walls as connected segments, not isolated blocks.
- Movement: characters move continuously between tiles. At each tile center, check if desired direction is open; if not, continue current direction. Buffer one direction input.
- Ghost AI (4 distinct behaviors): (1) Chaser: targets player's current tile using Manhattan distance. (2) Ambusher: targets 4 tiles ahead of player's facing direction. (3) Flanker: uses vector from chaser's position through player, doubled. (4) Random: picks random valid direction at each intersection.
- Ghost states: scatter (patrol corner), chase (use AI), frightened (random movement, blue color, player can eat), eaten (eyes return to spawn).
- Power pellet: 4 per level, larger dots. On eat: ghosts enter frightened mode for 8s (flash at 2s remaining). Ghost point values double each eat: 200, 400, 800, 1600.
- Dot system: place dots on all path tiles except ghost house. Track dots remaining for level completion.
- Pathfinding for ghost AI: BFS or simple tile-by-tile direction choice (check all valid exits, pick the one closest to target).
- Tunnel wrapping: if maze has openings on edges, wrap x position.`,
  },

  // ── Platformer ──
  {
    id: "side-scroller",
    name: "Side-Scrolling Platformer",
    description: "Jump-and-run with levels",
    category: "platformer",
    engine: "canvas2d",
    starterPrompt:
      "Create a side-scrolling platformer with a character that runs and jumps across platforms, collects coins, avoids enemies, has multiple levels, and features smooth camera following.",
    skills: `Platformer Genre Guidelines:
- Physics: apply gravity each frame: vy += gravity * dt (gravity ~800-1200 px/s^2). Cap fall speed: vy = Math.min(vy, maxFallSpeed). Horizontal: apply acceleration, friction (vx *= 0.85 when no input on ground).
- Coyote time: allow jump for 100-150ms after leaving a platform edge. Track lastGroundedTime, allow jump if (now - lastGroundedTime) < coyoteWindow.
- Jump buffering: if jump pressed while airborne within 100ms of landing, execute jump on land. Track lastJumpPressTime.
- Variable jump height: on jump, set vy = -jumpStrength. If jump key released early and vy < 0, multiply vy by 0.5 for short hop.
- Tile-based collision: resolve Y axis first (land on top, hit ceiling), then X axis (stop at walls). Use AABB overlap with tile grid.
- Camera: horizontal deadzone (don't scroll until player reaches edge zone). Smooth lerp: cameraX += (targetX - cameraX) * 0.08. Look-ahead: shift target in movement direction.
- Parallax backgrounds: 3+ layers scrolling at 0.1x, 0.3x, 0.6x camera speed.
- Enemy AI: simple patrol (walk between two points, reverse on edge/wall). Stomping: player kills enemy if player.vy > 0 and player.bottom overlaps enemy.top half.
- Coin collection: circle-AABB overlap check, particle burst on collect, persistent score.`,
  },
  {
    id: "endless-runner",
    name: "Endless Runner",
    description: "Auto-scrolling obstacle dodger",
    category: "platformer",
    engine: "canvas2d",
    starterPrompt:
      "Create an endless runner game where the character auto-runs, can jump and slide, obstacles appear procedurally, the speed gradually increases, and there's a distance-based scoring system.",
    skills: `Endless Runner Genre Guidelines:
- Auto-scroll: world moves left at constant speed (start 300px/s, increase 5px/s per 10s, cap at 600px/s). Player stays at fixed X position (~20% from left).
- Jump physics: tap for normal jump, hold for higher jump (variable jump height). Double-jump: allow one extra mid-air jump. Slide: shrink hitbox height by 50% for 0.5s.
- Procedural generation: maintain a buffer of upcoming segments. Generate new segments when rightmost is within 2 screen widths. Segment types: flat ground, gap, elevated platform, low barrier (slide under), high barrier (jump over).
- Obstacle spacing: minimum gap between obstacles = 250ms at current speed. Use a difficulty curve: reduce minimum gap and increase obstacle frequency over time.
- Ground tiles: seamlessly tile ground sprites. Recycle off-screen tiles to the right.
- Parallax: 3-4 background layers at different scroll speeds relative to game speed.
- Particle trail: small dust particles behind player's feet while running. Burst on landing.
- Scoring: distance-based (1 point per 10px traveled). Display current distance and best distance.
- Visual speed cues: add speed lines at high velocities, increase particle density.
- Death animation: tumble/ragdoll effect, slow-motion for 0.3s, then game over screen.`,
  },

  // ── Puzzle ──
  {
    id: "match-3",
    name: "Match-3",
    description: "Swap gems to match 3+ in a row",
    category: "puzzle",
    engine: "canvas2d",
    starterPrompt:
      "Create a match-3 puzzle game with a grid of colorful gems, swap-to-match mechanics, chain reactions, score multipliers, and satisfying animations when matches are made.",
    skills: `Match-3 Genre Guidelines:
- Grid: 8x8 board of gem types (5-6 colors). Store as 2D array of integers. Render each cell as a colored shape or circle with distinct visual per type.
- Swap mechanic: click gem, then click adjacent gem to swap. Only allow swap if it creates a match of 3+. If no match, animate swap back.
- Match detection: after every swap/settle, scan all rows and columns for 3+ consecutive same-type gems. Use two passes: horizontal then vertical. Collect matched positions in a Set to avoid double-counting intersections.
- Cascade/chain: after removing matches, gems above fall down (animate drop). Then fill empty top cells with new random gems (animate drop in). Re-check for matches. Each cascade level increases score multiplier.
- Gravity animation: gems fall with acceleration (vy += gravity * dt). Snap to grid when reaching target row. Stagger column drops slightly for visual appeal.
- Match animation: matched gems scale up briefly (1.2x over 0.15s), then burst into particles and fade. Screen flash on large matches (5+).
- Scoring: 3-match = 50pts, 4-match = 150pts, 5-match = 300pts. Multiply by cascade level (1x, 2x, 3x...). Display floating score text at match position.
- Special gems: 4-match creates a line-clear gem (clears entire row or column). 5-match creates a color bomb (clears all of one color).
- No-moves detection: scan all possible swaps; if none create a match, shuffle the board.`,
  },
  {
    id: "tetris-style",
    name: "Tetris-Style",
    description: "Falling block puzzle",
    category: "puzzle",
    engine: "canvas2d",
    starterPrompt:
      "Create a Tetris-style falling block puzzle game with all 7 tetrominoes, rotation, line clearing, next piece preview, level progression with increasing speed, and a ghost piece showing where the piece will land.",
    skills: `Tetris-Style Genre Guidelines:
- Board: 10 wide x 20 tall grid (plus 2-4 hidden rows above). Store as 2D array; 0 = empty, 1-7 = piece colors.
- 7 Tetrominoes: I, O, T, S, Z, J, L. Store each as array of 4 {x, y} offsets relative to rotation center.
- SRS rotation: Super Rotation System. Store rotation states (0-3) for each piece. On rotate, test 5 kick positions in order. If piece fits at any kick offset, use that position. Wall kick data tables are essential for proper rotation near walls/floor.
- Ghost piece: render a translucent copy of the current piece at its hard-drop position (scan downward until collision).
- Lock delay: piece locks 0.5s after landing on surface. Reset delay if player moves/rotates (up to 15 resets). Instant lock on hard drop.
- Line clear: scan all rows bottom-to-top. Remove full rows, shift rows above down. Animate clear (flash row white, then collapse). Scoring: 1 line = 100*level, 2 = 300*level, 3 = 500*level, 4(Tetris) = 800*level.
- Drop speed formula: interval = Math.max(50, 1000 - (level - 1) * 80) ms. Soft drop = 20x speed. Hard drop = instant.
- 7-bag randomizer: shuffle all 7 pieces, deal in order, then reshuffle. Guarantees no drought longer than 12 pieces.
- Next piece preview: show next 1-3 pieces in a sidebar. Hold piece: swap current with held piece (once per drop).
- Input: left/right move, up = rotate CW, Z = rotate CCW, down = soft drop, space = hard drop.`,
  },
  {
    id: "push-puzzle",
    name: "Push Puzzle",
    description: "Sokoban-style crate-pushing",
    category: "puzzle",
    engine: "canvas2d",
    starterPrompt:
      "Create a Sokoban-style push puzzle game where the player pushes crates onto target squares in a warehouse maze, with undo functionality, move counter, and multiple levels of increasing difficulty.",
    skills: `Push Puzzle (Sokoban) Genre Guidelines:
- Tile map: 2D array with tile types: wall, floor, target, player, crate, crate-on-target. Standard tile size 48-64px.
- Movement: discrete grid movement. Player moves one tile per input. If moving into a crate, check if the tile beyond the crate is empty or target; if so, push crate. Cannot push two crates.
- Win condition: all target tiles occupied by crates. Check after each move.
- Undo system: maintain a move history stack. Each entry stores: player position, all crate positions. On undo, pop and restore state. Essential for Sokoban.
- Level design: store levels as string arrays for easy editing. Start simple (1-2 crates, small room), increase to 5+ crates with complex layouts.
- Visual feedback: crates on targets glow or change color. Animate movement (smooth interpolation over 100-150ms between grid positions). Pulse targets that still need crates.
- Move counter: display total moves and pushes. Show par/optimal for each level if known.
- Level progression: 10+ levels. Store completion state. Show level select screen.
- Dead state detection (optional): detect if a crate is in a corner (not on target) = unsolvable. Highlight stuck crates in red.
- Smooth rendering: lerp entity positions between grid cells during movement animation.`,
  },

  // ── Strategy / Sim ──
  {
    id: "tower-defense",
    name: "Tower Defense",
    description: "Place towers to stop enemy waves",
    category: "strategy",
    engine: "canvas2d",
    starterPrompt:
      "Create a tower defense game with a path for enemies to follow, placeable tower types (basic, splash, sniper), wave-based enemy spawning, an economy system, and upgrade mechanics.",
    skills: `Tower Defense Genre Guidelines:
- Path system: define waypoints as array of {x, y}. Enemies follow waypoints in sequence. Interpolate between points: progress += speed * dt / distance. Pre-calculate segment distances.
- Tower placement: grid-based (not on path tiles). Show valid/invalid placement preview. Tower types: (1) Basic: single target, medium range, fast fire rate. (2) Splash: AoE damage in radius, slow fire rate. (3) Sniper: long range, high damage, very slow fire rate.
- Tower targeting: find enemies in range (distance check each frame). Modes: nearest to tower, first along path (highest progress), strongest (most HP). Rotate tower sprite to face target.
- Projectile lead prediction: target position when projectile arrives. leadTime = distance / projectileSpeed; targetPos = enemy.pos + enemy.velocity * leadTime.
- Wave system: define waves as array of {enemyType, count, spawnInterval, delay}. Show "Next Wave" button during breaks. Auto-start after 15s.
- Economy: start with base gold. Earn gold per kill. Tower costs: basic 100, splash 200, sniper 300. Upgrades cost 1.5x base. Display gold prominently.
- Enemy variety: normal (medium HP, medium speed), fast (low HP, high speed), tank (high HP, slow speed), healer (heals nearby enemies).
- Health bars above enemies. Lives counter: enemies reaching end subtract 1 life.
- Upgrade system: click placed tower to upgrade (damage +50%, range +20%, fire rate +25%). 3 upgrade levels max.`,
  },
  {
    id: "idle-clicker",
    name: "Idle / Clicker",
    description: "Incremental progression game",
    category: "strategy",
    engine: "canvas2d",
    starterPrompt:
      "Create an idle clicker game with click-to-earn mechanics, auto-generators that produce currency, upgrades that multiply earnings, prestige/reset mechanic, and satisfying number formatting for large values.",
    skills: `Idle / Clicker Genre Guidelines:
- Core loop: click button to earn base currency. Display currency with formatted large numbers. Use suffixes: K (1e3), M (1e6), B (1e9), T (1e12), Qa (1e15), Qi (1e18). Format: toFixed(2) + suffix.
- Auto-generators: purchasable buildings that produce currency per second. Each type costs more than the last. Cost scaling: baseCost * Math.pow(1.15, owned). Display rate (X/sec) for each.
- Generator types (5-8): e.g., Cursor (0.1/s), Worker (1/s), Factory (8/s), Mine (47/s), Lab (260/s). Each ~5-6x more productive and expensive than previous.
- Upgrade system: one-time purchases that multiply output. Per-generator upgrades (double output of type X) and global multipliers. Unlock at ownership thresholds (10, 25, 50, 100).
- Offline progress: on load, calculate elapsed time since last save. Award accumulated income (cap at 8 hours). Save to localStorage every 30s.
- Prestige mechanic: reset all progress for a permanent multiplier. Prestige currency earned = floor(sqrt(totalEarned / 1e6)). Each prestige point = +1% all income.
- Visual feedback: number pop on click (+X floating up), progress bars for next generator, milestone notifications. Click area should feel responsive with scale animation.
- UI layout: large click area top/center, generators list on side, upgrades in tabs. Show total CPS (currency per second) prominently.
- Big number math: use standard JS numbers up to 1e15, switch to notation formatting. Keep fractional values for smooth accumulation.`,
  },

  // ── Action ──
  {
    id: "top-down-shooter",
    name: "Top-Down Shooter",
    description: "Twin-stick style arena combat",
    category: "action",
    engine: "canvas2d",
    starterPrompt:
      "Create a top-down twin-stick shooter with WASD movement, mouse aiming, multiple weapon types, enemy waves that get progressively harder, health/ammo pickups, and arena boundaries.",
    skills: `Top-Down Shooter Genre Guidelines:
- Movement: WASD for 8-directional movement. Normalize diagonal: if both axes pressed, multiply each by 0.707. Apply velocity with friction: vx *= 0.88 each frame.
- Aiming: calculate angle from player to mouse: Math.atan2(mouseY - playerY, mouseX - playerX). Rotate player sprite to face cursor. Draw a subtle aim line or crosshair.
- Shooting: click to fire. Bullet spawns at player position, travels in aim direction. Bullet speed 600-800px/s. Fire rate cooldown per weapon type.
- Weapon types: (1) Pistol: single shot, fast fire rate, infinite ammo. (2) Shotgun: 5 bullets in 30-degree spread, slow fire rate, 20 ammo. (3) Rifle: fast auto-fire, 100 ammo. (4) Rocket: AoE explosion on impact, 5 ammo.
- Enemy AI: move toward player. On reaching melee range, attack. Types: (1) Rusher: fast, low HP, runs straight at player. (2) Shooter: keeps distance, fires at player. (3) Tank: slow, high HP, absorbs damage.
- Wave system: spawn enemies at arena edges. Each wave increases count and introduces harder types. Brief pause between waves. Display wave number.
- Collision: circle-circle for bullets vs enemies. AABB for player vs pickups. Pool bullets and enemies (recycle objects, don't allocate/deallocate).
- Health/ammo drops: enemies drop pickups (20% chance). Health restores 25%. Ammo restores 50% of weapon max.
- Screen shake on damage taken and explosions. Particle blood/sparks on hits. Muzzle flash on firing.
- Arena: rectangular boundary. Camera follows player with slight smoothing.`,
  },

  // ── .io Arena ──
  {
    id: "agar-io",
    name: "Agar.io Style",
    description: "Grow by absorbing smaller cells",
    category: "io-arena",
    engine: "canvas2d",
    starterPrompt:
      "Create an agar.io style game where the player controls a cell on a large arena, eats food pellets to grow, can split and eject mass, absorbs smaller AI cells, and avoids larger ones. Include a minimap, leaderboard, and smooth camera zoom that scales with cell size.",
    skills: `Agar.io Style Genre Guidelines:
- World: large arena (e.g. 5000x5000 units) with a grid background. Camera follows player cell, viewport scales with cell size.
- Player cell: circle with mass. Radius = Math.sqrt(mass) * scaleFactor. Movement: cell moves toward mouse position. Speed inversely proportional to mass: speed = baseSpeed / Math.sqrt(mass). Lerp position toward target for smooth movement.
- Food pellets: 500-1000 small static circles scattered randomly. On eat (overlap check: distance < playerRadius), increase player mass, respawn food elsewhere. Use spatial grid (e.g. 100x100 cells) for efficient collision checks.
- AI cells: 15-30 bots with simple AI. Each bot picks a target (nearest food or smaller cell). Bots flee from larger cells. Vary bot sizes for ecosystem balance. Name each bot.
- Absorption: a cell can eat another if it is 10%+ larger (mass ratio > 1.1) and overlaps by more than the smaller cell's radius. Absorber gains the eaten cell's mass.
- Split mechanic: on spacebar, split cell into two halves. One half launches toward mouse at high speed, decelerating quickly. Split cells reunite after 15s. Cap max split pieces at 16.
- Eject mass: on W key, fire a small pellet toward mouse. Costs ~15% of a food pellet. Can be eaten by anyone.
- Camera zoom: smoothly interpolate zoom based on total player mass. Larger = more zoomed out. Use canvas scale transform.
- Minimap: small top-right overlay showing full arena. Player dot + large cell dots.
- Leaderboard: top-right list of top 10 cells by mass. Update every second.
- Decay: cells above a threshold mass lose mass slowly (0.2%/s) to prevent infinite growth.`,
  },
  {
    id: "slither-io",
    name: "Slither.io Style",
    description: "Snake arena with boost and food trails",
    category: "io-arena",
    engine: "canvas2d",
    starterPrompt:
      "Create a slither.io style game where the player controls a snake on a large arena, eats glowing food orbs to grow longer, can boost to cut off other AI snakes, and collects mass from eliminated snakes. Include smooth turning, a length-based leaderboard, and a minimap.",
    skills: `Slither.io Style Genre Guidelines:
- World: large circular arena (radius ~3000 units) with a subtle hex-grid background. Kill boundary at edge. Camera follows snake head.
- Snake body: array of segment positions. Head follows mouse direction with smooth turning (max turn rate ~4 rad/s). Each frame, head moves forward by speed * dt, previous segments follow via chaining: each segment lerps toward the one in front. Segment spacing ~8-12px.
- Growth: eating food adds segments to the tail. Snake length = score. Radius scales with length: headRadius = 10 + Math.sqrt(length) * 0.5, capped.
- Food orbs: 400-800 small glowing circles. Vary color and slight size. On eat (head overlaps orb), grow by 1 segment. Respawn orb randomly within arena.
- Boost: hold left-click or spacebar to boost (2x speed). While boosting, shed small food orbs from the tail (lose 1 segment every 0.2s). Shed orbs are edible by anyone. Trail of glowing dots behind boosting snake.
- AI snakes: 10-20 bots. Simple AI: move toward nearest food cluster, avoid head-on collisions with larger snakes, occasionally boost to cut off smaller snakes. Each bot has a name and color.
- Collision/death: if a snake's head touches ANY other snake's body, the head snake dies. On death, convert all segments into food orbs along the body path (big reward for the killer). Player respawns as a small snake.
- Smooth turning: snake head rotates toward mouse angle at a capped rate. Use Math.atan2 for target angle, interpolate current angle toward target with angular lerp (handle wrapping).
- Rendering: draw segments as overlapping circles (or thick line with round caps). Alternate segment colors slightly for a striped look. Eyes on head segment facing movement direction.
- Minimap: bottom-right showing arena boundary circle, player dot, and large snake dots.
- Leaderboard: top 10 snakes by length.`,
  },
  {
    id: "krunker-io",
    name: "Krunker.io Style",
    description: "Fast-paced first-person arena shooter",
    category: "io-arena",
    engine: "threejs",
    starterPrompt:
      "Create a krunker.io style first-person shooter with Three.js featuring fast movement with bunny-hopping, multiple weapon classes, AI opponents, a blocky map with ramps and platforms, a killfeed, and a scoreboard.",
    skills: `Krunker.io Style FPS Guidelines (Three.js):
- Use Three.js from CDN. First-person camera with pointer lock. Mouse look: yaw (left/right unlimited) and pitch (up/down clamped -89 to 89 degrees). High mouse sensitivity feel.
- Movement: WASD relative to camera yaw. Base speed 12-15 units/s. Air strafing: allow direction changes mid-air with reduced authority. Bunny-hopping: if jump is pressed on the frame of landing, preserve momentum and add a small speed bonus (1.05x, capped at 1.4x base speed). Gravity 25 units/s^2. Jump velocity 10 units/s.
- Map: blocky arena built from BoxGeometry. Include: open courtyard, 2-3 corridors, elevated platforms connected by ramps (angled BoxGeometry), a sniper perch, crate cover. Total size ~80x80 units. Use MeshLambertMaterial with flat muted colors (grey, tan, olive). No textures needed.
- Weapons (3 classes): (1) Assault Rifle: auto-fire, 30 round mag, moderate damage (25), fast fire rate (0.1s), slight spread. (2) Sniper: single shot, 5 round mag, high damage (100), slow fire rate (1.2s), no spread, scope zoom on right-click (FOV 20). (3) Shotgun: 6 pellets in spread, 6 round mag, high close-range damage (15 per pellet), pump delay (0.8s).
- Shooting: raycast from camera center (THREE.Raycaster). On hit, apply damage. Muzzle flash: brief PointLight at gun position (0.05s). Hit marker: white crosshair flash on hit. Headshot zone: upper 25% of enemy hitbox = 2x damage.
- AI bots: 5-8 bots. Each bot has an assigned weapon class. Bot AI: patrol between random waypoints, on seeing player (raycast line-of-sight check, within FOV 90 degrees), turn and fire. Reaction time 0.3-0.5s. Bots respawn 3s after death at random spawn points.
- Health/respawn: player has 100 HP. On death, freeze 1.5s showing killer info, then respawn at a random spawn point with full HP and ammo. Health regenerates 5 HP/s after 4s without taking damage.
- HUD (HTML overlay): crosshair center screen, HP bar bottom-left, ammo count bottom-right, killfeed top-right (last 5 kills, fade after 4s), scoreboard on Tab key (name, kills, deaths for all players).
- Rendering: low-poly aesthetic. No textures. Use flat shading. Bots as capsule shapes (CylinderGeometry + SphereGeometry top) with team-colored material. Weapon as a small BoxGeometry attached to camera.`,
  },

  // ── 3D ──
  {
    id: "low-poly-runner-3d",
    name: "Low-Poly Runner 3D",
    description: "Third-person auto-runner",
    category: "3d",
    engine: "threejs",
    starterPrompt:
      "Create a 3D low-poly endless runner with a character running forward automatically, lane-switching (left/center/right), jumping over obstacles, collecting coins, and a stylized low-poly environment with Three.js.",
    skills: `3D Low-Poly Runner Guidelines (Three.js):
- Use Three.js from CDN. Scene setup: PerspectiveCamera behind and above player (offset: 0, 5, -10), looking at player. OrbitControls NOT needed (fixed chase camera).
- Player: BoxGeometry or grouped primitives (body + head + limbs). Position at z increasing over time (or move world toward camera). 3 lanes at x = -2, 0, +2.
- Lane switching: smooth lerp between lanes. player.targetX = lane * 2; player.mesh.position.x += (targetX - mesh.position.x) * 0.15. Input: A/D or left/right arrows.
- Jump: on spacebar, set vy = 8. Apply gravity: vy -= 20 * dt. Clamp y >= 0 (ground level). Simple boolean isGrounded check.
- Obstacles: BoxGeometry or CylinderGeometry placed on lanes ahead. Pool and recycle obstacles that pass behind camera. Spawn interval decreases with speed.
- Ground: series of PlaneGeometry or BoxGeometry segments. Recycle segments that pass behind camera. Add variation: slight color changes, random small geometry on sides (low-poly trees = ConeGeometry + CylinderGeometry).
- Coins: small SphereGeometry or TorusGeometry rotating slowly. Collect on proximity (distance < 1.5). Particle burst (small spheres flying outward) on collect.
- Lighting: DirectionalLight (sun) + AmbientLight. Use MeshLambertMaterial or MeshPhongMaterial with flat shading (flatShading: true) for low-poly look.
- Speed: start at 10 units/s, increase 0.5/s every 10s. Cap at 25 units/s.
- Fog: scene.fog = new THREE.Fog(skyColor, 20, 80) to hide pop-in.`,
  },
  {
    id: "3d-maze-explorer",
    name: "3D Maze Explorer",
    description: "First-person maze navigation",
    category: "3d",
    engine: "threejs",
    starterPrompt:
      "Create a first-person 3D maze explorer with Three.js where the player navigates through a randomly generated maze, finds keys to open doors, has a minimap, and a fog-of-war that reveals as you explore.",
    skills: `3D Maze Explorer Guidelines (Three.js):
- Use Three.js from CDN. First-person camera: attach camera to player object. Mouse look: track mousemove deltas, rotate camera yaw (left/right) and pitch (up/down, clamp -80 to 80 degrees). Request pointer lock on click.
- Maze generation: use recursive backtracker (DFS) algorithm on a grid (15x15 to 25x25). Each cell is a corridor; walls between cells are conditionally removed. Store maze as 2D array of wall booleans (north, south, east, west per cell).
- 3D walls: for each wall segment, create a BoxGeometry (width=cellSize, height=wallHeight ~3, depth=wallThickness ~0.3). Use MeshLambertMaterial with slight color variation per wall for visual interest.
- Floor and ceiling: PlaneGeometry spanning entire maze. Textured or colored. Floor slightly reflective (MeshPhongMaterial).
- Movement: WASD relative to camera facing direction. Calculate forward vector from camera yaw. Move speed 4-6 units/s. Collision: before moving, check if new position overlaps any wall (AABB test against wall segments within 1-cell radius).
- Minimap: render 2D top-down view in a corner (HTML canvas overlay or separate Three.js orthographic camera to a render target). Show player position and direction arrow. Fog of war: only show visited cells (track visited set).
- Keys and doors: place 2-3 colored keys at dead ends. Doors block corridors, require matching key. Keys rotate slowly and bob up/down (sin wave).
- Lighting: PointLight attached to player (torch effect, range 8-12 units). Low ambient light (0.1 intensity) for atmosphere. Optional: flickering torch (vary light intensity with noise).
- Goal: reach the exit (opposite corner from start). Glow effect on exit (emissive material or bright point light).
- Timer: track completion time. Display elapsed time in HUD.`,
  },
] as const;
