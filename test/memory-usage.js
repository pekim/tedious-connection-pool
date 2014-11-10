//test for memory leak on bad connections
var ConnectionPool = require('../lib/connection-pool');
var fs = require('fs');

var count = 0;
var mem = [];
var groupCount = 10;
var poolSize = 1000;

var pool = new ConnectionPool({ max: poolSize, min: poolSize, retryDelay: 1}, {
    userName: 'testLogin',
    password: 'wrongPassword',
    server: 'localhost'
});

pool.on('error', function() {
        var i = Math.floor(count++ / poolSize);
        if (i === groupCount) {
            var previous = 0;
            for (var f = 0; f < groupCount; f++) {
                var size = (mem[f] / poolSize);
                fs.writeSync(1, ((f+1) * poolSize) + ': ' + Math.round(mem[f] / poolSize * 100) + 'KB\n');
                previous = size;
            }
            process.exit(0);
        }
        mem[i] = (mem[i] || 0) + (process.memoryUsage().heapUsed / 1000); //kilobytes
});