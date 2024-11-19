const Eris = require("eris");
const http = require("http");
const fs = require("fs");
const keep_alive = require("./keep_alive.js"); // Keeps the bot alive (Glitch/Replit)

// Replace TOKEN with your bot account's token
const bot = new Eris(process.env.token);

const DATA_FILE = "mentionCounts.json"; // File to store leaderboard data
let mentionCounts = loadData(); // Load leaderboard data from file
let clients = []; // Array to hold connected clients for SSE

// Log errors
bot.on("error", (err) => {
  console.error(err); // Log errors for debugging
});

// Fetch messages from Discord channels and update mention counts
bot.on("ready", async () => {
  console.log("Bot is connected and ready!");

  // Fetch recent messages from all channels the bot can access
  const guilds = bot.guilds.map((guild) => guild);
  for (const guild of guilds) {
    for (const channel of guild.channels.values()) {
      if (channel.type === 0) { // Text channels only
        try {
          const messages = await channel.getMessages(100); // Fetch last 100 messages
          for (const msg of messages) {
            if (msg.mentions.some((user) => user.id === bot.user.id)) {
              const userId = msg.author.username;
              mentionCounts[userId] = (mentionCounts[userId] || 0) + 1;
            }
          }
        } catch (err) {
          console.error(`Error fetching messages for channel ${channel.name}:`, err);
        }
      }
    }
  }

  // Save the updated leaderboard data
  saveData();

  // Broadcast the leaderboard to connected clients
  broadcastLeaderboard();
});

// Track mentions in real-time messages
bot.on("messageCreate", (msg) => {
  if (msg.mentions.some((user) => user.id === bot.user.id)) {
    const userId = msg.author.username; // Use username for better readability
    mentionCounts[userId] = (mentionCounts[userId] || 0) + 1;

    // Save updated data to file
    saveData();

    // Notify all connected clients
    broadcastLeaderboard();
  }
});

// Connect the bot to Discord
bot.connect();

// Use Replit-assigned port or default to 8080
const PORT = process.env.PORT || 8080;

// Web server to display leaderboard
http.createServer(function (req, res) {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    const html = generateHTML();
    res.write(html);
    res.end();
  } else if (req.url === "/chart.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    try {
      res.write(fs.readFileSync("node_modules/chart.js/dist/chart.umd.js"));
    } catch (err) {
      console.error("Error reading Chart.js file:", err);
      res.end("Chart.js file not found!");
    }
    res.end();
  } else if (req.url === "/events") {
    // Handle Server-Sent Events (SSE)
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    clients.push(res);

    // Send current leaderboard data to new client on connection
    const leaderboard = Object.entries(mentionCounts)
      .sort((a, b) => b[1] - a[1]) // Sort by count, descending
      .slice(0, 10); // Top 10
    res.write(`data: ${JSON.stringify(leaderboard)}\n\n`);

    // Remove client when connection is closed
    req.on("close", () => {
      clients = clients.filter((client) => client !== res);
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
}).listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Broadcast leaderboard data to all clients
function broadcastLeaderboard() {
  const leaderboard = Object.entries(mentionCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count, descending
    .slice(0, 10); // Top 10

  const data = JSON.stringify(leaderboard);
  clients.forEach((client) => {
    client.write(`data: ${data}\n\n`);
  });
}

// Save leaderboard data to file
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(mentionCounts, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving data:", err);
  }
}

// Load leaderboard data from file
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = fs.readFileSync(DATA_FILE, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error loading data:", err);
    }
  }
  return {}; // Return an empty object if the file doesn't exist
}

// Generate HTML for the leaderboard
function generateHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bot Mention Leaderboard</title>
  <script src="/chart.js"></script>
  <style>
    /* Reset Styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: "Poppins", Arial, sans-serif;
      background: linear-gradient(135deg, #6a11cb, #2575fc);
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 20px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }

    .container {
      width: 90%;
      max-width: 600px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    canvas {
      max-width: 100%;
      height: auto;
    }

    footer {
      margin-top: 20px;
      font-size: 0.9rem;
      color: #fff; /* Ensure white text for footer */
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <h1>Top 10 Users Who Mentioned the Bot</h1>
  <div class="container">
    <canvas id="myChart"></canvas>
  </div>
  <footer>
    Powered by <strong>Discord.js</strong> and <strong>Chart.js</strong><br>
    &copy; 2024 <strong>Siddhartha412</strong>. All rights reserved.
  </footer>
<script>
  const ctx = document.getElementById('myChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Mentions',
        data: [],
        backgroundColor: getCustomColors(10),
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'white', // Set x-axis labels to white
          },
          grid: {
            color: 'white', // Set grid lines for x-axis to white
          },
        },
        y: {
          ticks: {
            color: 'white', // Set y-axis labels to white
          },
          grid: {
            color: 'white', // Set grid lines for y-axis to white
          },
        },
      }
    }
  });

  const eventSource = new EventSource('/events');
  eventSource.onmessage = (event) => {
    const leaderboard = JSON.parse(event.data);
    chart.data.labels = leaderboard.map(entry => entry[0]);
    chart.data.datasets[0].data = leaderboard.map(entry => entry[1]);
    chart.update();
  };

  function getCustomColors(count) {
    const colors = [
      'rgba(173, 216, 230, 0.8)',
      'rgba(255, 255, 224, 0.8)',
      'rgba(144, 238, 144, 0.8)',
      'rgba(255, 99, 71, 0.8)',
      'rgba(0, 0, 0, 0.8)',
      'rgba(255, 255, 255, 0.8)',
      'rgba(255, 182, 193, 0.8)',
    ];
    return colors.slice(0, count);
  }
</script>

</body>
</html>`;
}
