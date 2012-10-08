var PooledConnection = require('./pooled-connection'),
    PoolModule = require('generic-pool');

var connectionEventNames = [
  'connect',
  'end',
  'debug',
  'infoMessage',
  'errorMessage',
  'databaseChange',
  'languageChange',
  'charsetChange',
  'secure'
];

function ConnectionPool(poolConfig, connectionConfig) {
  var self = this,
      param = {
        name: poolConfig.name || "",
	log: true,
        create: function(callback) {
          connection = new PooledConnection(connectionConfig);
	  connection.on('connect', function(err) {
            if (err) {
	      callback(err,null); 
	    }
	    else {
	      connection.on('release', function() {
                self.pool.release(connection);
              });
	      callback(null, connection);
	    }
	  });
	},
        destroy: function(connection) {
          connection._close();
	},
	max: poolConfig.max || 10,
	min: poolConfig.min || 0,
	idleTimeoutMillis: poolConfig.idleTimeoutMillis || 30000
      };
  this.pool = PoolModule.Pool(param);
}
module.exports = ConnectionPool;


ConnectionPool.prototype.requestConnection = function(callback) {
  var self = this;
  this.pool.acquire(function(err, connection) {
    if(err) {
      callback(err, null); 
    }
    else {
      callback(null, connection);
      connection.emit('connect');
    }
  });
}

