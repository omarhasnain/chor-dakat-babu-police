const socket = io();
let currentRoomCode = null;
let myRole = null;
let playersList = [];
let myTotalScore = 0;
let timerInterval = null;

// Join Functions (same)
function createRoom() {
  const name = document.getElementById('playerName').value.trim();
  const totalRounds = document.getElementById('totalRounds').value;
  if (!name) return alert("Please enter your name");
  socket.emit('createRoom', { playerName: name, totalRounds });
}

function joinRoom() {
  const name = document.getElementById('playerName').value.trim();
  const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!name) return alert("Please enter your name");
  if (!roomCode) return alert("Please enter room code");
  socket.emit('joinRoom', { roomCode, playerName: name });
}

// Socket Events
socket.on('roomUpdate', (data) => {
  currentRoomCode = data.roomCode;
  document.getElementById('joinScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');
  document.getElementById('roomCodeDisplay').textContent = data.roomCode;
  playersList = data.players;
  updatePlayersList(data.players);
});

socket.on('roleAssigned', (data) => {
  myRole = data.role;
  document.getElementById('myNameDisplay').textContent = data.playerName || "You";
  document.getElementById('roleCard').classList.remove('hidden');
  document.getElementById('playerRole').textContent = data.role;
  document.getElementById('roundNumber').textContent = data.round;
  document.getElementById('totalRoundsDisplay').textContent = data.totalRounds;
  document.getElementById('questionDisplay').textContent = data.question || "";
});

socket.on('gamePhase', (data) => {
  document.getElementById('phaseInfo').textContent = data.message;
  
  if (timerInterval) clearInterval(timerInterval);

  if (data.timer) {
    startTimer(data.timer);
  }

  if (data.phase === 'discussion' || data.phase === 'voting') {
    document.getElementById('votingArea').classList.remove('hidden');
    
    setTimeout(() => {
      if (myRole === 'Police') {
        createVotingButtons();
      } else {
        document.getElementById('voteButtons').innerHTML = `<p style="color:#ffd700;">Waiting for Police...</p>`;
      }
    }, 500);
  }
});

socket.on('roundResult', (data) => {
  myTotalScore = data.totalScore;
  document.getElementById('myTotalScore').textContent = myTotalScore;

  const area = document.getElementById('resultArea');
  area.classList.remove('hidden');
  area.innerHTML = `
    <h2>${data.message}</h2>
    ${data.timeTaken ? `<p>Time Taken: <strong>${data.timeTaken} seconds</strong></p>` : ''}
    <p>Round Points: <strong>+${data.points}</strong></p>
    <p><strong>Total: ${myTotalScore}</strong></p>
  `;
});

// ==================== Fixed Timer ====================
function startTimer(seconds) {
  if (timerInterval) clearInterval(timerInterval);
  
  let timeLeft = seconds;
  const timerEl = document.getElementById('timer');
  timerEl.textContent = timeLeft;
  timerEl.style.color = "#ff4757";

  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;

    if (timeLeft <= 10) timerEl.style.color = "#ff0000";
    if (timeLeft <= 0) clearInterval(timerInterval);
  }, 1000);
}

socket.on('finalScoreboard', (data) => {
  if (timerInterval) clearInterval(timerInterval);
  document.getElementById('gameScreen').classList.add('hidden');
  document.getElementById('finalScreen').classList.remove('hidden');

  // Final leaderboard code (same as before)
  let html = `<h2>Final Leaderboard</h2>`;
  html += `<p>Average Catch Time: <strong>${data.avgPoliceTime} seconds</strong></p><br>`;

  data.leaderboard.forEach((player, i) => {
    let special = "";
    if (i === 0) special = `<span style="color:gold;">🏆 Winner Winner Chicken Dinner!</span>`;
    if (i === data.leaderboard.length - 1) special = `<span style="color:#ff6b6b;">😂 Better luck next time!</span>`;

    html += `<div class="player"><strong>#${i+1}</strong> ${player.name} — ${player.score} pts ${special}</div>`;
  });

  document.getElementById('finalLeaderboard').innerHTML = html;
});

// Voting
function createVotingButtons() {
  const container = document.getElementById('voteButtons');
  container.innerHTML = '<p><strong>Choose your target:</strong></p>';

  playersList.forEach(player => {
    if (player.id === socket.id) return;
    const btn = document.createElement('button');
    btn.textContent = player.name;
    btn.onclick = () => makeAccusation(player.id);
    container.appendChild(btn);
  });
}

function makeAccusation(accusedId) {
  socket.emit('makeAccusation', { roomCode: currentRoomCode, accusedId });
  document.getElementById('voteButtons').innerHTML = `<p style="color:#4caf50;">Accusation Submitted!</p>`;
}

function updatePlayersList(players) {
  const container = document.getElementById('playersList');
  container.innerHTML = '<h3>Players in Room:</h3>';
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player';
    div.textContent = p.name;
    container.appendChild(div);
  });
}