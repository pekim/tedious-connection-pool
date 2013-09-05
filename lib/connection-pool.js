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

function ConnectionPool(poolConfig, connectionConfig, failoverConfig) {
  var self = this,
      param = {
        name: poolConfig.name || "",
        log: poolConfig.log,
        create: function (callback) {
          self.createConnection(self, callback, self.failedOver);
        },
        destroy: function (connection) {
          connection._close();
        },
        max: poolConfig.max || 10,
        min: poolConfig.min || 0,
        idleTimeoutMillis: poolConfig.idleTimeoutMillis || 30000
      };
  this.connectionConfig = connectionConfig;
  this.failoverConfig = failoverConfig;
  this.failedOver = false;
  this.pool = PoolModule.Pool(param);
}

module.exports = ConnectionPool;

ConnectionPool.prototype.createConnection = function (self, callback, failedOver, tryFailover) {

  if ((tryFailover && !failedOver) || (!tryFailover && failedOver)) {
    var connection = new PooledConnection(self.failoverConfig);
  }
  else {
    var connection = new PooledConnection(self.connectionConfig);
  }

  var connected = false;
  var errorConnecting = null;

  connection.on('errorMessage', function (err) {
    if (err.class === 11 && !connected) {
      errorConnecting = err;
    }
  });

  connection.on('connect', function (err) {
    if (connected) {
      // The real 'connect' event has already been emmited by the
      // connection, and processed in this function.
      //
      // This is now the fake connect event emmited by the acquire function,
      // for applications' benefit.
      return;
    }

    if (err) {
      if (!tryFailover && self.failoverConfig) {
        self.createConnection(self, callback, failedOver, true)
      }
      else {
        callback(err, null);
      }
      callback(err, null);
    }
    else if (errorConnecting) {
      if (!tryFailover && self.failoverConfig) {
        self.createConnection(self, callback, failedOver, true)
      }
      else {
        callback(errorConnecting, null);
      }
    }
    else {
      connected = true;
      if (tryFailover) {
        self.failedOver = !failedOver;
      }

      connection.on('release', function () {
        connectionEventNames.forEach(function removeAllListeners(eventName) {
          connection.removeAllListeners(eventName);
        });
        if(connection.state == this.STATE.FINAL)  {
          self.pool.destroy(connection);
        }
        else {
          self.pool.release(connection);
        }
      });

      callback(null, connection);
    }
  });
}

ConnectionPool.prototype.requestConnection = function (callback) {
  var self = this;
  this.pool.acquire(function (err, connection) {
    if (err) {
      callback(err, null);
    }
    else {
      callback(null, connection);
      connection.emit('connect');
    }
  });
};

ConnectionPool.prototype.drain = function (callback) {
  var self = this;

  self.pool.drain(function () {
    self.pool.destroyAllNow();
    callback();
  });
};
