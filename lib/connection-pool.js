'use strict';
var poolModule = require('generic-pool');
var PooledConnection = require('./pooled-connection');

function ConnectionPool(poolConfig, connectionConfig) {
    var self = this;

    this.pool = poolModule.Pool({
        name: poolConfig.name || "",
        create: function (callback) {
            var connection = new PooledConnection(self, connectionConfig);
            connection.on('connect', function (err) {
                if (err)
                    callback(err, null);
                else
                    callback(null, connection);
            });
        },
        destroy: function (connection) {
            connection.destroyed = true;
            connection.close();
        },
        validate: function(connection) {
            return !connection.closed;
        },
        max: poolConfig.max || 10,
        min: poolConfig.min || 0,
        idleTimeoutMillis: poolConfig.idleTimeoutMillis || 30000,
        log: poolConfig.log
    });
}

ConnectionPool.prototype.acquire = function (callback) {
    return this.pool.acquire(callback);
};

ConnectionPool.prototype.drain = function (callback) {
    var self = this;

    this.pool.drain(function () {
        self.pool.destroyAllNow(callback);
    });
};

module.exports = ConnectionPool;
