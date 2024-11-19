const http = require("http");

http.createServer(function (req, res) {
  res.write("I'm alive");
  res.end();
}).listen(3000, () => console.log("Keep-alive server running on port 3000"));
