var assert = require('assert');
var ConnectionPool = require('../lib/connection-pool');
var Request = require('tedious').Request;

var connectionConfig = {
    userName: 'test',
    password: 'test',
    server: 'dev1',
    options: {
        appName: 'pool-test'
    }
};

describe('ConnectionPool', function () {
    it('min', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 2};
        var pool = new ConnectionPool(poolConfig, connectionConfig);

        setTimeout(function() {
            assert.equal(pool.connections.length, poolConfig.min);
            done();
            pool.drain();
        }, 4);
    });

    it('max', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 2, max: 5};
        var pool = new ConnectionPool(poolConfig, connectionConfig);

        var count = 20;
        var run = 0;

        //run more queries than pooled connections
        runQueries(pool, count, 200, function() {
            run++;
            assert(pool.connections.length <= poolConfig.max);
            if (run === count) {
                done();
                pool.drain();
            }
        });
    });

    it('connection error event', function (done) {

        var poolConfig = {min: 2, max: 5};
        var pool = new ConnectionPool(poolConfig, {});
        pool.on('error', function(err) {
            assert(!!err);
            done();
            pool.drain();
        });
    });

    it('connection error retry', function (done) {
        this.timeout(10000);
        var poolConfig = {min: 1, max: 5, retryDelay: 5};
        var pool = new ConnectionPool(poolConfig, {});
        pool.on('error', function(err) {
            assert(!!err);
            pool.connectionConfig = connectionConfig;
        });

        function testConnected() {
            for (var i = pool.connections.length - 1; i >= 0; i--) {
                if (pool.connections[i].status === 3/*RETRY*/) {
                    setTimeout(testConnected, 100);
                    return;
                }
            }

            assert.equal(pool.connections.length, poolConfig.min);
            done();
            pool.drain();
        }

        setTimeout(testConnected, 100);
    });

    it('idle timeout', function (done) {
        this.timeout(10000);
        var poolConfig = {min: 1, max: 5, idleTimeout: 100};
        var pool = new ConnectionPool(poolConfig, connectionConfig);

        setTimeout(function() {
            runQueries(pool, 1, 0, function() {
                done();
                pool.drain();
            });
        }, 300);
    });
});

function runQueries(pool, count, keepOpen, complete) {
    var createRequest = function (connection) {
        var request = new Request('select 42', function (err, rowCount) {
            assert.strictEqual(rowCount, 1);
            setTimeout(function() {
                complete();
                connection.release();
            }, keepOpen);
        });

        request.on('row', function (columns) {
            assert.strictEqual(columns[0].value, 42);
        });

        connection.execSql(request);
    };

    for (var i = 0; i < count; i++) {
        setTimeout(function() {
            pool.acquire(createRequest);
        })
    }
}
