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

        function testMin() {
            if (pool.pending.length > 0) { //wait for connections to be created
                setTimeout(testMin, 100);
                return;
            }
            assert.equal(pool.free.length, poolConfig.min);
            done();
            pool.drain();
        }

        setTimeout(testMin, 100);
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
            var d = pool.pending.length + pool.free.length + pool.used.length <= poolConfig.max;
            if (!d)
                debugger;
            assert(pool.pending.length + pool.free.length + pool.used.length <= poolConfig.max);
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
        var poolConfig = {min: 2, max: 5, retryDelay: 5};
        var pool = new ConnectionPool(poolConfig, {});
        pool.on('error', function(err) {
            assert(!!err);
            pool.connectionConfig = connectionConfig;
        });

        function testConnected() {
            if (pool.pending.length > 0) { //wait for connections to be created
                setTimeout(testConnected, 100);
                return;
            }
            assert.equal(pool.free.length, poolConfig.min);
            done();
            pool.drain();
        }

        setTimeout(testConnected, 100);
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
