// Test for memory leak after closing connections.
var ConnectionPool = require('../lib/connection-pool');
var fs = require('fs');

var connectionCount = 0;
var currentGroup = 0;
var memGroupsBytes = [];

var groupCount = 20;
var poolSize = 1000;
var maxConnections = groupCount * poolSize;

// Print initial memory usage at program start.
printMemoryUsage(0, process.memoryUsage().heapUsed, 1);

for (i = 0; i < groupCount; i++) {
    memGroupsBytes[i] = 0;
}

// Setup for connection failures.
var pool = new ConnectionPool({ max: poolSize, min: poolSize, retryDelay: 1 }, {
    userName: 'testLogin',
    password: 'wrongPassword',
    server: 'localhost'
});

pool.on('error', function () {
    var isNewPool = (++connectionCount % poolSize) == 0;
    memGroupsBytes[currentGroup] += process.memoryUsage().heapUsed;

    if (isNewPool) {
        printMemoryUsage(connectionCount, memGroupsBytes[currentGroup], poolSize);
        currentGroup++;
        global.gc();
    }

    if (connectionCount === maxConnections) {
        // Validation to detect memory leaks.
        var memNoiseThresholdKB = 2 * 1024;

        memGroupsBytes.sort(function (a, b) {
            return a - b;
        });

        var maxMemDeltaKB = Math.round((memGroupsBytes[groupCount - 1] - memGroupsBytes[0]) / poolSize / 1024);

        if (maxMemDeltaKB > memNoiseThresholdKB) {
            fs.writeSync(2, '\nMemory leak detected during ' + maxConnections + ' failed connections.\n');
            fs.writeSync(2, 'Max memory delta(=' + maxMemDeltaKB + 'KB) > Threshold(=' + memNoiseThresholdKB + 'KB)\n');
        }
        else {
            fs.writeSync(1, '\nMemory leak not detected during ' + maxConnections + ' failed connections.\n');
            fs.writeSync(1, 'Max memory delta(=' + maxMemDeltaKB + 'KB) < Threshold(=' + memNoiseThresholdKB + 'KB)\n');
        }

        process.exit(0);
    }
});

function printMemoryUsage(connectionCount, cumulativeMemoryUsageBytes, numMemoryUsagesCount) {
    var memoryUsageKB = Math.round(cumulativeMemoryUsageBytes / numMemoryUsagesCount / 1024);
    fs.writeSync(1, connectionCount + ': ' + memoryUsageKB + 'KB\n');
}
