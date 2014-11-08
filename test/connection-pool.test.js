var assert = require('assert');
var ConnectionPool = require('../lib/connection-pool');
var Request = require('tedious').Request;

var connectionConfig = {
    userName: 'test',
    password: 'test',
    server: 'dev1',
    options: {
        appName: 'pool-test',
        database: 'test'
    }
};
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

        var createRequest = function (connection) {
            var request = new Request('select 42', function (err, rowCount) {
                assert.strictEqual(rowCount, 1);
                setTimeout(function() {
                    run++;
                    assert(pool.connections.length <= poolConfig.max);
                    if (run === count) {
                        done();
                        pool.drain();
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
            })
        }
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
            pool.acquire(function (connection) {
                var request = new Request('select 42', function (err, rowCount) {
                    assert.strictEqual(rowCount, 1);
                    done();
                    pool.drain();
                });

                request.on('row', function (columns) {
                    assert.strictEqual(columns[0].value, 42);
                });

                connection.execSql(request);
            });

        }, 300);
    });

    it('lost connection error', function (done) {
        this.timeout(10000);
        var poolConfig = {min: 1, max: 5};
        var pool = new ConnectionPool(poolConfig, connectionConfig);

        pool.on('error', function(err) {
            assert(err && err.name === 'ConnectionError');
            done();
            pool.drain();
        });

        //This simulates a lost connections by creating a job that kills the current session and then deleting the job.
        //The user must have the SQLAgentOperatorRole permission on the msdb database and ALTER ANY CONNECTION on master
        pool.acquire(function (connection) {
            var command = 'DECLARE @jobName VARCHAR(68) = \'pool\' + CONVERT(VARCHAR(64),NEWID()), @jobId UNIQUEIDENTIFIER;' +
            'EXECUTE msdb..sp_add_job @jobName, @owner_login_name=\'' + connectionConfig.userName + '\', @job_id=@jobId OUTPUT;' +
            'EXECUTE msdb..sp_add_jobserver @job_id=@jobId;' +

            'DECLARE @cmd VARCHAR(50);' +
            'SELECT @cmd = \'kill \' + CONVERT(VARCHAR(10), @@SPID);' +
            'EXECUTE msdb..sp_add_jobstep @job_id=@jobId, @step_name=\'Step1\', @command = @cmd, @database_name = \'' + connectionConfig.options.database + '\', @on_success_action = 3;' +

            'DECLARE @deleteCommand varchar(200);' +
            'SET @deleteCommand = \'execute msdb..sp_delete_job @job_name=\'\'\'+@jobName+\'\'\'\';' +
            'EXECUTE msdb..sp_add_jobstep @job_id=@jobId, @step_name=\'Step2\', @command = @deletecommand;' +

            'EXECUTE msdb..sp_start_job @job_id=@jobId;' +
            'WAITFOR DELAY \'00:00:10\';' +
            'SELECT 42';

            var request = new Request(command, function (err, rowCount) {
                assert(false);
            });

            request.on('row', function (columns) {
                assert(false);
            });

            connection.execSql(request);
        });
    });
});
