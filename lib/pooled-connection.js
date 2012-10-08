var Connection = require('tedious').Connection;
var util = require('util');

function PooledConnection(config) {
    Connection.call(this, config);
}

util.inherits(PooledConnection, Connection);

PooledConnection.prototype.close = function() {
    this.emit('release');//used by the pool
    this.emit('end');
}

PooledConnection.prototype._close = function() {
    return Connection.prototype.close.call(this);
}

module.exports = PooledConnection;
