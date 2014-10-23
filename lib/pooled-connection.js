var Connection = require('tedious').Connection;

function PooledConnection(pool, config) {
    var self = this;

    this.pool = pool;
    this.isEnded = false;

    Connection.call(this, config);

    this.on('end', function () {
        self.isEnded = true;
        self.pool.destroy(self);
    });
}

PooledConnection.prototype = Object.create(Connection.prototype);

PooledConnection.prototype.release = function () {
    this.pool.release(this);
};

module.exports = PooledConnection;
