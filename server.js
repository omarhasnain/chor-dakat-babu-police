const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

let rooms = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id.substring(0,8)}...`);

    socket.on('createRoom', (data) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = {
            players: [],
            currentRound: 1,
            totalRounds: parseInt(data.totalRounds),
            scores: {},
            roundStartTime: null,
            policeTimes: []
        };
        joinRoom(socket, roomCode, data.playerName);
    });

    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return socket.emit('error', 'Room not found!');
        if (room.players.length >= 4) return socket.emit('error', 'Room is full!');

        joinRoom(socket, data.roomCode, data.playerName);
    });

    function joinRoom(socket, roomCode, playerName) {
        socket.join(roomCode);
        const room = rooms[roomCode];

        const player = { id: socket.id, name: playerName, role: null };
        room.players.push(player);
        room.scores[socket.id] = 0;

        io.to(roomCode).emit('roomUpdate', {
            players: room.players.map(p => ({ name: p.name, id: p.id })),
            roomCode
        });

        if (room.players.length === 4) startNewRound(roomCode);
    }

    function startNewRound(roomCode) {
        const room = rooms[roomCode];
        room.roundStartTime = Date.now();

        // Random Role Assignment
        const roles = ['Babu', 'Police', 'Dakat', 'Chor'];
        const shuffled = roles.sort(() => 0.5 - Math.random());

        room.players.forEach((player, i) => {
            player.role = shuffled[i];
        });

        // Random Question
        const isChorTarget = Math.random() > 0.5;
        room.targetRole = isChorTarget ? 'Chor' : 'Dakat';
        room.question = isChorTarget ? "Who is the Chor (Thief)?" : "Who is the Dakat (Robber)?";

        // Send roles privately
        room.players.forEach(player => {
            io.to(player.id).emit('roleAssigned', {
                role: player.role,
                round: room.currentRound,
                totalRounds: room.totalRounds,
                question: room.question
            });
        });

        io.to(roomCode).emit('gamePhase', {
            phase: 'discussion',
            message: room.question,
            timer: 60
        });

        let timeLeft = 60;
        const timer = setInterval(() => {
            timeLeft--;
            io.to(roomCode).emit('timerUpdate', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(timer);
                io.to(roomCode).emit('gamePhase', { phase: 'voting', message: room.question });
            }
        }, 1000);
    }

    socket.on('makeAccusation', ({ roomCode, accusedId }) => {
        const room = rooms[roomCode];
        if (!room) return;

        const police = room.players.find(p => p.id === socket.id);
        if (!police || police.role !== 'Police') return;

        const accused = room.players.find(p => p.id === accusedId);
        if (!accused) return;

        const timeTaken = Math.floor((Date.now() - room.roundStartTime) / 1000);
        const isCorrect = accused.role === room.targetRole;

        if (isCorrect) room.policeTimes.push(timeTaken);

        calculateRoundResult(roomCode, isCorrect, accused, timeTaken);
    });


    function calculateRoundResult(roomCode, isCorrect, accusedPlayer, timeTaken) {
        const room = rooms[roomCode];

        room.players.forEach(player => {
            let points = 0;
            let message = "";

            if (player.role === 'Babu') {
                points = 1200;
                message = "🎉 You are Babu this round!";
            } else if (player.role === 'Police') {
                if (isCorrect) {
                    points = 800;
                    message = `✅ Excellent! Caught in ${timeTaken} seconds.`;
                } else {
                    points = 0;
                    message = `😔 Wrong accusation!`;
                }
            } else {
                if (isCorrect && player.id === accusedPlayer.id) {
                    points = 0;
                    message = "😂 You got caught!";
                } else {
                    points = player.role === 'Dakat' ? 600 : 400;
                    message = "😎 You survived!";
                }
            }

            room.scores[player.id] += points;

            io.to(player.id).emit('roundResult', {
                points,
                message,
                role: player.role,
                timeTaken: (player.role === 'Police' && isCorrect) ? timeTaken : null,
                totalScore: room.scores[player.id]
            });
        });

        room.currentRound++;

        if (room.currentRound > room.totalRounds) {
            setTimeout(() => showFinalScoreboard(roomCode), 5000);
        } else {
            // Start next round after 5 seconds
            setTimeout(() => startNewRound(roomCode), 5200);
        }
    }

    function showFinalScoreboard(roomCode) {
        const room = rooms[roomCode];
        const avgTime = room.policeTimes.length ? 
            (room.policeTimes.reduce((a,b)=>a+b,0) / room.policeTimes.length).toFixed(1) : "N/A";

        const leaderboard = room.players
            .map(p => ({ name: p.name, score: room.scores[p.id] }))
            .sort((a,b) => b.score - a.score);

        io.to(roomCode).emit('finalScoreboard', { leaderboard, avgPoliceTime: avgTime });
    }

    socket.on('disconnect', () => {
        for (let code in rooms) {
            const room = rooms[code];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) delete rooms[code];
        }
    });
});

server.listen(3000, () => {
    console.log('✅ Server running on http://localhost:3000');
});