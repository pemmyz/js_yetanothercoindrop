document.addEventListener('DOMContentLoaded', () => {
    // --- Canvas and Context Setup ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const CANVAS_WIDTH = 600;
    const CANVAS_HEIGHT = 800;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // --- UI Elements ---
    const scoreEl = document.getElementById('score');
    const attemptsEl = document.getElementById('attempts');
    const gameOverScreen = document.getElementById('game-over-screen');
    const finalScoreEl = document.getElementById('final-score');
    const restartButton = document.getElementById('restart-button');

    // --- Game State and Constants ---
    let score = 0;
    let attempts = 10;
    let gameState = 'ready'; // 'ready', 'aiming', 'flying', 'gameOver'
    
    const GRAVITY = 0.3;
    const FRICTION = 0.995; // Air resistance
    const BOUNCE_FACTOR = 0.7; // Energy lost on bounce
    const COIN_RADIUS = 12;
    const PEG_RADIUS = 8;


    // --- Sound Effects (using Web Audio API for self-containment) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(type) {
        if (!audioCtx) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);

        if (type === 'launch') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        } else if (type === 'bounce') {
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        } else if (type === 'score') {
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.2);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        } else if (type === 'miss') {
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        }
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);
    }

    // --- Game Objects ---
    let coin = {};
    const LAUNCH_POS = { x: CANVAS_WIDTH - 40, y: 60 };

    const pegs = [];
    const gates = [];
    const particles = [];
    
    function initializeGame() {
        score = 0;
        attempts = 10;
        gameState = 'ready';
        updateUI();
        gameOverScreen.classList.add('hidden');
        
        createCoin();
        createPegs();
        createGates();
    }
    
    function createCoin() {
        coin = {
            x: LAUNCH_POS.x,
            y: LAUNCH_POS.y,
            radius: COIN_RADIUS,
            vx: 0,
            vy: 0,
            rotation: 0,
            isActive: false,
        };
    }

    // --- UPDATED PEG LAYOUT LOGIC ---
    function createPegs() {
        pegs.length = 0;
        const rows = 10;
        const startY = 200;
        const rowSpacing = 55;
        const pegsInEvenRow = 7;
        const pegsInOddRow = 6;

        // --- UPDATED LOGIC HERE: Ensure gap is wider than coin diameter ---
        // The gap between the wall and the peg's edge must be > coin's diameter.
        // Gap = horizontalMargin - PEG_RADIUS. So we need:
        // horizontalMargin - PEG_RADIUS > COIN_RADIUS * 2
        // Therefore, horizontalMargin > COIN_RADIUS * 2 + PEG_RADIUS
        const horizontalMargin = (COIN_RADIUS * 2) + PEG_RADIUS + 3; // Coin Diameter + Peg Radius + 3px buffer

        const playableWidth = CANVAS_WIDTH - 2 * horizontalMargin;
        const baseSpacing = playableWidth / (pegsInEvenRow - 1);

        for (let i = 0; i < rows; i++) {
            const y = startY + i * rowSpacing;
            const isEvenRow = i % 2 === 0;

            if (isEvenRow) {
                for (let j = 0; j < pegsInEvenRow; j++) {
                    const x = horizontalMargin + (j * baseSpacing);
                    pegs.push({ x, y, radius: PEG_RADIUS });
                }
            } else { // Odd Row
                const spacing = playableWidth / (pegsInOddRow - 1); // Use specific spacing for this row
                for (let j = 0; j < pegsInOddRow; j++) {
                    // Start this row offset by half a base space to be in the gaps of the row above.
                    const x = horizontalMargin + (baseSpacing / 2) + (j * baseSpacing);
                    pegs.push({ x, y, radius: PEG_RADIUS });
                }
            }
        }
    }


    function createGates() {
        gates.length = 0; // Clear existing gates
        const gateY = CANVAS_HEIGHT - 50;
        const gateHeight = 50;
        
        gates.push({ x: 50,  width: 60, y: gateY, height: gateHeight, points: 20, color: '#888888', flash: 0 }); // Medium Grey
        gates.push({ x: 160, width: 40, y: gateY, height: gateHeight, points: 50, color: '#bbbbbb', flash: 0 }); // Light Grey
        gates.push({ x: 250, width: 100,y: gateY, height: gateHeight, points: 10, color: '#555555', flash: 0 }); // Dark Grey
        gates.push({ x: 400, width: 40, y: gateY, height: gateHeight, points: 50, color: '#bbbbbb', flash: 0 }); // Light Grey
        gates.push({ x: 490, width: 60, y: gateY, height: gateHeight, points: 20, color: '#888888', flash: 0 }); // Medium Grey
        // Jackpot Gate
        gates.push({ x: 215, width: 20, y: gateY, height: gateHeight, points: 100, color: '#ffffff', flash: 0 }); // White
    }

    // --- Input Handling ---
    let mouse = { x: 0, y: 0, isDown: false };
    
    canvas.addEventListener('mousedown', (e) => {
        if (gameState === 'ready') {
            mouse.isDown = true;
            gameState = 'aiming';
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });

    canvas.addEventListener('mouseup', () => {
        if (gameState === 'aiming') {
            mouse.isDown = false;
            gameState = 'flying';
            coin.isActive = true;
            
            const launchPower = Math.min(Math.hypot(mouse.x - coin.x, mouse.y - coin.y) / 10, 15);
            const angle = Math.atan2(mouse.y - coin.y, mouse.x - coin.x);
            
            const randomFactor = 1 + (Math.random() - 0.5) * 0.1; // +/- 5%
            
            coin.vx = Math.cos(angle) * launchPower * randomFactor;
            coin.vy = Math.sin(angle) * launchPower * randomFactor;
            
            attempts--;
            updateUI();
            playSound('launch');
        }
    });

    restartButton.addEventListener('click', () => {
        initializeGame();
        gameLoop();
    });

    // --- Game Logic (Update) ---
    function update() {
        if (gameState !== 'flying' || !coin.isActive) return;

        // Apply physics
        coin.vy += GRAVITY;
        coin.vx *= FRICTION;
        coin.vy *= FRICTION;
        coin.x += coin.vx;
        coin.y += coin.vy;
        coin.rotation += coin.vx * 0.1;

        // Wall collisions
        if (coin.x + coin.radius > CANVAS_WIDTH || coin.x - coin.radius < 0) {
            coin.vx *= -BOUNCE_FACTOR;
            coin.x = Math.max(coin.radius, Math.min(CANVAS_WIDTH - coin.radius, coin.x));
            playSound('bounce');
        }
        if (coin.y - coin.radius < 0) { // Top wall
             coin.vy *= -BOUNCE_FACTOR;
             coin.y = coin.radius;
             playSound('bounce');
        }

        // Peg collisions
        pegs.forEach(peg => {
            const dx = coin.x - peg.x;
            const dy = coin.y - peg.y;
            const distance = Math.hypot(dx, dy);
            if (distance < coin.radius + peg.radius) {
                playSound('bounce');
                const angle = Math.atan2(dy, dx);
                const overlap = coin.radius + peg.radius - distance;
                coin.x += Math.cos(angle) * overlap;
                coin.y += Math.sin(angle) * overlap;
                
                const normalX = dx / distance;
                const normalY = dy / distance;
                const dotProduct = (coin.vx * normalX + coin.vy * normalY);
                coin.vx = (coin.vx - 2 * dotProduct * normalX) * BOUNCE_FACTOR;
                coin.vy = (coin.vy - 2 * dotProduct * normalY) * BOUNCE_FACTOR;
            }
        });

        // Gate / Miss check
        if (coin.y > CANVAS_HEIGHT - 80) {
            let hasScored = false;
            gates.forEach(gate => {
                if (!hasScored && coin.x > gate.x && coin.x < gate.x + gate.width) {
                    score += gate.points;
                    gate.flash = 60; // flash for 60 frames
                    createParticles(coin.x, coin.y, gate.color, gate.points);
                    playSound('score');
                    resetCoin();
                    hasScored = true;
                }
            });

            if (!hasScored && coin.y > CANVAS_HEIGHT) {
                playSound('miss');
                resetCoin();
            }
        }
    }
    
    function resetCoin() {
        updateUI();
        if (attempts <= 0) {
            endGame();
            return;
        }
        createCoin();
        gameState = 'ready';
    }

    function endGame() {
        gameState = 'gameOver';
        finalScoreEl.textContent = score;
        gameOverScreen.classList.remove('hidden');
    }
    
    function updateUI() {
        scoreEl.textContent = score;
        attemptsEl.textContent = attempts;
    }
    
    function createParticles(x, y, color, points) {
        for (let i = 0; i < 30; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5 - 2,
                size: Math.random() * 3 + 1,
                life: 60,
                color
            });
        }
        particles.push({
            x, y: y-10,
            vx: 0,
            vy: -1,
            life: 80,
            color: '#fff',
            text: `+${points}`
        });
    }
    
    function updateParticles() {
        for(let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life--;
            p.x += p.vx;
            p.y += p.vy;
            if (p.text) p.vy *= 0.95;
            
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    // --- Rendering (Draw) ---
    function draw() {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#cccccc';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(LAUNCH_POS.x, LAUNCH_POS.y, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(LAUNCH_POS.x, LAUNCH_POS.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        gates.forEach(gate => {
            ctx.strokeStyle = gate.flash > 0 ? '#fff' : gate.color;
            ctx.lineWidth = gate.flash > 0 ? 4 : 2;
            ctx.shadowColor = gate.flash > 0 ? '#fff' : gate.color;
            ctx.shadowBlur = 15;
            ctx.strokeRect(gate.x, gate.y, gate.width, gate.height);
            
            ctx.fillStyle = gate.flash > 0 ? '#000' : gate.color;
            ctx.font = 'bold 20px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(gate.points, gate.x + gate.width / 2, gate.y + 30);
            
            if(gate.flash > 0) gate.flash--;
        });
        
        pegs.forEach(peg => {
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#999999';
            ctx.shadowColor = '#999999';
            ctx.shadowBlur = 10;
            ctx.fill();
        });
        ctx.shadowBlur = 0;
        
        if (gameState === 'aiming') {
            const power = Math.min(Math.hypot(mouse.x - coin.x, mouse.y - coin.y) / 10, 15);
            const angle = Math.atan2(mouse.y - coin.y, mouse.x - coin.x);
            
            ctx.beginPath();
            ctx.moveTo(coin.x, coin.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();

            drawTrajectory(power, angle);
        }
        
        if (coin.isActive || gameState === 'ready' || gameState === 'aiming') {
            ctx.save();
            ctx.translate(coin.x, coin.y);
            ctx.rotate(coin.rotation);
            ctx.beginPath();
            ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#c0c0c0';
            ctx.strokeStyle = '#f0f0f0';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -coin.radius);
            ctx.lineTo(0, coin.radius);
            ctx.strokeStyle = '#a0a0a0';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
            ctx.shadowBlur = 0;
        }
        
        updateParticles();
        particles.forEach(p => {
            ctx.globalAlpha = p.life / 60;
            if(p.text) {
                ctx.fillStyle = p.color;
                ctx.font = 'bold 24px "Courier New"';
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1.0;
    }
    
    function drawTrajectory(power, angle) {
        let simCoin = {
            x: coin.x, y: coin.y,
            vx: Math.cos(angle) * power,
            vy: Math.sin(angle) * power
        };

        ctx.beginPath();
        ctx.moveTo(simCoin.x, simCoin.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 5]);

        for (let i = 0; i < 150; i++) {
            simCoin.vy += GRAVITY;
            simCoin.x += simCoin.vx;
            simCoin.y += simCoin.vy;

            if (simCoin.x > CANVAS_WIDTH || simCoin.x < 0) simCoin.vx *= -1;

            if (i % 3 === 0) {
                ctx.lineTo(simCoin.x, simCoin.y);
            }
            if (simCoin.y > CANVAS_HEIGHT) break;
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }


    // --- Main Game Loop ---
    function gameLoop() {
        if (gameState === 'gameOver') return;
        
        update();
        draw();
        
        requestAnimationFrame(gameLoop);
    }

    // --- Start Game ---
    initializeGame();
    gameLoop();
});
