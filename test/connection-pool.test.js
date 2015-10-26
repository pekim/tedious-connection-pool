var assert = require('assert');
var Request = require('tedious').Request;
var fs = require('fs');
var ConnectionPool = require('../lib/connection-pool');

function getConfig() {
    var config = JSON.parse(fs.readFileSync(process.env.HOME + '/.tedious/test-connection-pool.json', 'utf8')).config;
    return config;
}

/* create a db user with the correct permissions:
CREATE DATABASE test
CREATE LOGIN test WITH PASSWORD=N'test', DEFAULT_DATABASE=test, CHECK_POLICY=OFF
GRANT ALTER ANY CONNECTION TO test

USE test
CREATE USER test FOR LOGIN test WITH DEFAULT_SCHEMA=dbo
ALTER ROLE db_owner ADD MEMBER test

USE msdb
CREATE USER test FOR LOGIN test WITH DEFAULT_SCHEMA=dbo
ALTER ROLE SQLAgentOperatorRole ADD MEMBER test
ALTER ROLE SQLAgentReaderRole ADD MEMBER test
ALTER ROLE SQLAgentUserRole ADD MEMBER test
*/

/* disable the user when not testing:
ALTER LOGIN test DISABLE
*/

describe('ConnectionPool', function () {
    it('min', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 2};
        var pool = new ConnectionPool(poolConfig, getConfig());

        setTimeout(function() {
            assert.equal(pool.connections.length, poolConfig.min);
            pool.drain(done);
        }, 4);
    });

    it('min=0', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 0, idleTimeout: 10};
        var pool = new ConnectionPool(poolConfig, getConfig());

        setTimeout(function() {
            assert.equal(pool.connections.length, 0);
        }, 4);

        setTimeout(function() {
            pool.acquire(function(err, connection) {
                assert(!err);

                var request = new Request('select 42', function (err, rowCount) {
                    assert.strictEqual(rowCount, 1);
                    connection.release();
                    setTimeout(function () {
                        assert.equal(pool.connections.length, 0);
                        pool.drain(done);
                    }, 200);
                });

                request.on('row', function (columns) {
                    assert.strictEqual(columns[0].value, 42);
                });

                connection.execSql(request);
            });
        }, 2000);
    });

    it('max', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 2, max: 5};
        var pool = new ConnectionPool(poolConfig, getConfig());

        var count = 20;
        var run = 0;

        var createRequest = function (err, connection) {
            assert(!err);

            var request = new Request('select 42', function (err, rowCount) {
                assert.strictEqual(rowCount, 1);
                setTimeout(function() {
                    run++;
                    assert(pool.connections.length <= poolConfig.max);
                    if (run === count) {
                        pool.drain(done);
                        return;
                    }
                    connection.release();
                }, 200);
            });

            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, 42);
            });

            connection.execSql(request);
        };

        for (var i = 0; i < count; i++) {
            setTimeout(function() {
                pool.acquire(createRequest);
            }, 1);
        }
    });

    it('min<=max, min specified > max specified', function (done) {
        this.timeout(10000);

        var poolConfig = { min: 5, max: 1, idleTimeout: 10};
        var pool = new ConnectionPool(poolConfig, getConfig());

        setTimeout(function() {
            assert.equal(pool.connections.length, 1);
        }, 4);

        setTimeout(function() {
            pool.acquire(function(err, connection) {
                assert(!err);

                var request = new Request('select 42', function (err, rowCount) {
                    assert.strictEqual(rowCount, 1);
                    connection.release();
                    setTimeout(function () {
                        assert.equal(pool.connections.length, 1);
                        pool.drain(done);
                    }, 200);
                });

                request.on('row', function (columns) {
                    assert.strictEqual(columns[0].value, 42);
                });

                connection.execSql(request);
            });
        }, 2000);
    });

    it('min<=max, no min specified', function (done) {
        this.timeout(10000);

        var poolConfig = {max: 1, idleTimeout: 10};
        var pool = new ConnectionPool(poolConfig, getConfig());

        setTimeout(function() {
            assert.equal(pool.connections.length, 1);
        }, 4);

        setTimeout(function() {
            pool.acquire(function(err, connection) {
                assert(!err);

                var request = new Request('select 42', function (err, rowCount) {
                    assert.strictEqual(rowCount, 1);
                    connection.release();
                    setTimeout(function () {
                        assert.equal(pool.connections.length, 1);
                        pool.drain(done);
                    }, 200);
                });

                request.on('row', function (columns) {
                    assert.strictEqual(columns[0].value, 42);
                });

                connection.execSql(request);
            });
        }, 2000);
    });

    it('pool error event', function (done) {
        this.timeout(10000);
        var poolConfig = {min: 3};
        var pool = new ConnectionPool(poolConfig, {});

        pool.acquire(function() { });

        pool.on('error', function(err) {
            assert(!!err);
            pool.drain(done);
        });
    });

    it('connection retry', function (done) {
        this.timeout(10000);
        var poolConfig = {min: 1, max: 5, retryDelay: 5};
        var pool = new ConnectionPool(poolConfig, {});

        pool.on('error', function(err) {
            assert(!!err);
            pool.connectionConfig = getConfig();
        });

        function testConnected() {
            for (var i = pool.connections.length - 1; i >= 0; i--) {
                if (pool.connections[i].status === 3/*RETRY*/) {
                    setTimeout(testConnected, 100);
                    return;
                }
            }

            assert.equal(pool.connections.length, poolConfig.min);
            pool.drain(done);
        }

        setTimeout(testConnected, 100);
    });

    it('acquire timeout', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 1, max: 1, acquireTimeout: 2000};
        var pool = new ConnectionPool(poolConfig, getConfig());

        pool.acquire(function(err, connection) {
            assert(!err);
            assert(!!connection);
        });

        pool.acquire(function(err, connection) {
            assert(!!err);
            assert(!connection);
            done();
        });
    });

    it('idle timeout', function (done) {
        this.timeout(10000);
        var poolConfig = {min: 1, max: 5, idleTimeout: 100};
        var pool = new ConnectionPool(poolConfig, getConfig());

        setTimeout(function() {
            pool.acquire(function (err, connection) {
                assert(!err);

                var request = new Request('select 42', function (err, rowCount) {
                    assert.strictEqual(rowCount, 1);
                    pool.drain(done);
                });

                request.on('row', function (columns) {
                    assert.strictEqual(columns[0].value, 42);
                });

                connection.execSql(request);
            });

        }, 300);
    });

    it('lost connection handling', function (done) {
        this.timeout(10000);
        var poolConfig = {min: 1, max: 5};
        var connectionConfig = getConfig();

        connectionConfig.options = connectionConfig.options || {};
        connectionConfig.options.requestTimeout = 5000;            

        var pool = new ConnectionPool(poolConfig, connectionConfig);

        pool.on('error', function(err) {
            assert(err && err.name === 'ConnectionError');
        });

        //This simulates a lost connections by creating a job that kills the current session and then deletesthe job.
        pool.acquire(function (err, connection) {
            assert(!err);

            var command = 'DECLARE @jobName VARCHAR(68) = \'pool\' + CONVERT(VARCHAR(64),NEWID()), @jobId UNIQUEIDENTIFIER;' +
            'EXECUTE msdb..sp_add_job @jobName, @owner_login_name=\'' + connectionConfig.userName + '\', @job_id=@jobId OUTPUT;' +
            'EXECUTE msdb..sp_add_jobserver @job_id=@jobId;' +

            'DECLARE @cmd VARCHAR(50);' +
            'SELECT @cmd = \'kill \' + CONVERT(VARCHAR(10), @@SPID);' +
            'EXECUTE msdb..sp_add_jobstep @job_id=@jobId, @step_name=\'Step1\', @command = @cmd, @database_name = \'' + connectionConfig.options.database + '\', @on_success_action = 3;' +

            'DECLARE @deleteCommand VARCHAR(200);' +
            'SET @deleteCommand = \'execute msdb..sp_delete_job @job_name=\'\'\'+@jobName+\'\'\'\';' +
            'EXECUTE msdb..sp_add_jobstep @job_id=@jobId, @step_name=\'Step2\', @command = @deletecommand;' +

            'EXECUTE msdb..sp_start_job @job_id=@jobId;' +
            'WAITFOR DELAY \'01:00:00\';' +
            'SELECT 42';

            var request = new Request(command, function (err, rowCount) {
                assert(err);
                assert(err.code,'ETIMEOUT');
                pool.drain(done);
            });

            request.on('row', function (columns) {
                assert(false);
            });

            connection.execSql(request);
        });
    });

    it('release(), reset()', function (done) {
        this.timeout(10000);

        var poolConfig = {max: 1};
        var pool = new ConnectionPool(poolConfig, getConfig());

        var createRequest = function(query, value, callback) {
            var request = new Request(query, function (err, rowCount) {
                assert.strictEqual(rowCount, 1);
                callback();
            });

            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, value);
            });

            return request;
        };

        pool.acquire(function(err, conn) {
            assert(!err);

            conn.execSql(createRequest('SELECT 42', 42, function () {
                pool.release(conn); //release the connect

                pool.acquire(function (err, conn) { //re-acquire the connection
                    assert(!err);

                    conn.execSql(createRequest('SELECT 42', 42, function () {

                        pool.drain(done);
                    }));
                });
            }));
        });
    });

    it('drain', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 3};
        var pool = new ConnectionPool(poolConfig, getConfig());

        pool.acquire(function() { });

        setTimeout(function() {
            assert.equal(pool.connections.length, poolConfig.min);
            pool.drain(done);
        }, 4);
    });

    it('request callback should be called on socket error', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 1};

        var connectionConfig = getConfig();
        connectionConfig.options = connectionConfig.options || {};
        connectionConfig.options.requestTimeout = 60000;    

        var pool = new ConnectionPool(poolConfig, connectionConfig);

        pool.acquire(function(err, conn) {             
            var request = new Request("WAITFOR 00:00:30", function(err) {
                assert(err);
                assert.equal(err.message, 'socket error');
                pool.drain(done);
            });
            conn.execSql(request);
            conn.socket.emit('error', new Error('socket error'));
        });
        pool.on('error', function(err) {
            assert.equal(err.code, 'ESOCKET');
        });
    });

    it('connection should still work after socket error', function (done) {
        this.timeout(10000);

        var poolConfig = {min: 1, max: 1};

        var connectionConfig = getConfig();
        connectionConfig.options = connectionConfig.options || {};
        connectionConfig.options.requestTimeout = 60000;    

        var pool = new ConnectionPool(poolConfig, connectionConfig);

        var createRequest = function(query, value, callback) {
            var request = new Request(query, function (err, rowCount) {
                assert.strictEqual(rowCount, 1);
                callback();
            });

            request.on('row', function (columns) {
                assert.strictEqual(columns[0].value, value);
            });

            return request;
        };        

        pool.acquire(function(err, conn) {             
            var request = new Request("WAITFOR 00:00:30", function(err) {
                assert(err);
                assert.equal(err.message, 'socket error');
                conn.release();
                pool.acquire(function(err, conn) {
                    assert(!err);
                    conn.execSql(createRequest('SELECT 42', 42, function () {
                        pool.drain(done);
                    }));
                });
            });
            conn.execSql(request);
            conn.socket.emit('error', new Error('socket error'));
        });
        pool.on('error', function(err) {
            assert.equal(err.code, 'ESOCKET');
        });
    });    

});
