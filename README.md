# tedious-connection-pool
A connection pool for [tedious](http://github.com/pekim/tedious).

## Installation

    npm install tedious-connection-pool

## Example
The only difference from the regular tedious API is how the connection is obtained and released. Once a Connection object has been acquired, the tedious API can be used with the connection as normal.

```javascript

var ConnectionPool = require('tedious-connection-pool');
var Request = require('tedious').Request;
var assert = require('assert');

var poolConfig = {
    min: 5,
    max: 10
};

var connectionConfig = {
    userName: 'login',
    password: 'password',
    server: 'localhost'
};

var pool = new ConnectionPool(poolConfig, connectionConfig);

pool.acquire(function (connection) {
    var request = new Request('select 42', function(err, rowCount) {
        assert.strictEqual(rowCount, 1);
        
        connection.release(); // Release the connection back to the pool.
    });

    request.on('row', function(columns) {
        assert.strictEqual(columns[0].value, 42);
    });

    connection.execSql(request);
});

pool.on('error', function(err) {
    assert(!!err);
});
```

When the connection is released it is returned to the pool and is available to be reused.

##Class: ConnectionPool

### new ConnectionPool(poolConfig, connectionConfig)

* `poolConfig` {Object} the pool configuration object
  * `min` {Number} The minimun of connections there can be in the pool. Default = `10`
  * `max` {Number} The maximum number of connections there can be in the pool. Default = `50`
  * `idleTimeout` {Number} The number of milliseconds before closing an unused connection. Default = `30000`
  * `retryDelay` {Number} The number of milliseconds to wait after a connection fails, before trying again. Default = `5000`
  
* `connectionConfig` {Object} The same configuration that would be used to [create a
  tedious Connection](http://pekim.github.com/tedious/api-connection.html#function_newConnection).

### connectionPool.acquire(callback)
Acquire a Tedious Connection object from the pool.
* `callback` {Function} Callback function
  * `connection` {Object} A [Connection](http://pekim.github.com/tedious/api-connection.html)

### connectionPool.drain()
Close all pooled connections and stop making new ones. The pool should be discarded after it has been drained.

### connectionPool.error {event}
The 'error' event is emitted when a connection fails to connect to the SQL Server.

##Class: Connection
The following method is added to the Tedious [Connection](http://pekim.github.com/tedious/api-connection.html) object.

### Connection.release()
Release the connect back to the pool to be used again

## Version 0.3.x Breaking Changes
* The err parameter has been removed from the callback passed to acquire(). Connection errors can happen at many at times other than during acquire(). Subscribe to the 'error' event to be notified of connection errors.

## Version 0.2.x Breaking Changes
* To acquire a connection, call on acquire() on a ConnectionPool rather than requestConnection().
* After acquiring a PooledConnection, do not wait for the 'connected' event. The connection is received connected.
* Call release() on a PooledConnection to release the it back to the pool. close() permenantly closes the connection (as close() behaves in in tedious).