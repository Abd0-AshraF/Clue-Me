const http = require('http');
fetch("http://localhost:8081/api/auth/discord").then(res => {
  console.log(res.status, res.headers);
});
