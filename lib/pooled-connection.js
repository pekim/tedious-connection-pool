var Connection = require('tedious').Connection;

function PooledConnection(connectionPool, config) {
    var self = this;

    this.connectionPool = connectionPool;
    this.isEnded = false;

    Connection.call(this, config);

    this.on('end', function () {
        self.isEnded = true;
        self.connectionPool.pool.destroy(self);
    });
}

PooledConnection.prototype = Object.create(Connection.prototype);

PooledConnection.prototype.release = function () {
    this.connectionPool.pool.release(this);
};

module.exports = PooledConnection;
