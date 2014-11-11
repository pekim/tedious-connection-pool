# tedious-connection-pool
A connection pool for [tedious](http://github.com/pekim/tedious).

## Installation

    npm install tedious-connection-pool

## Example
The only difference from the regular tedious API is how the connection is obtained and released. Once a Connection object has been acquired, the tedious API can be used with the connection as normal.

```javascript
var ConnectionPool = require('tedious-connection-pool');
var Request = require('tedious').Request;

var poolConfig = {
    min: 2,
    max: 4,
    log: true
};

var connectionConfig = {
    userName: 'login',
    password: 'password',
    server: 'localhost'
};

var pool = new ConnectionPool(poolConfig, connectionConfig);

pool.acquire(function (err, connection) {
    if (err)
        console.error(err);

    var request = new Request('select 42', function(err, rowCount) {
        if (err)
            console.error(err);

        console.log('rowCount: ' + rowCount);

        connection.release(); // release the connection back to the pool.
        pool.drain(); //drain the pool when finished using it
    });

    request.on('row', function(columns) {
        console.log('value: ' + columns[0].value);
    });

    connection.execSql(request);
});

pool.on('error', function(err) {
    console.error(err);
});
```

When the connection is released it is returned to the pool and is available to be reused.

##Class: ConnectionPool

### new ConnectionPool(poolConfig, connectionConfig)

* `poolConfig` {Object} the pool configuration object
  * `min` {Number} The minimun of connections there can be in the pool. Default = `10`
  * `max` {Number} The maximum number of connections there can be in the pool. Default = `50`
  * `idleTimeout` {Number} The number of milliseconds before closing an unused connection. Default = `300000`
  * `retryDelay` {Number} The number of milliseconds to wait after a connection fails, before trying again. Default = `5000`
  * `acquireTimeout` {Number} The number of milliseconds to wait for a connection, before returning an error. Default = `60000`
  * `log` {Boolean|Function} Set to true to have debug log written to the console or pass a function to receive the log messages. Default = `undefined`
  
* `connectionConfig` {Object} The same configuration that would be used to [create a
  tedious Connection](http://pekim.github.com/tedious/api-connection.html#function_newConnection).

### connectionPool.acquire(callback)
Acquire a Tedious Connection object from the pool.

 * `callback(err, connection)` {Function} Callback function
  * `err` {Object} An Error object is an error occurred trying to acquire a connection, otherwise null.
  * `connection` {Object} A [Connection](http://pekim.github.com/tedious/api-connection.html)

### connectionPool.drain()
Close all pooled connections and stop making new ones. The pool should be discarded after it has been drained.

### connectionPool.error {event}
The 'error' event is emitted when a connection fails to connect to the SQL Server.

##Class: Connection
The following method is added to the Tedious [Connection](http://pekim.github.com/tedious/api-connection.html) object.

### Connection.release()
Release the connect back to the pool to be used again

## Version 0.3.x Changes
 * Removed dependency on the `generic-pool` node module.
 * Added `poolConfig` options `retryDelay`
 * Added `poolConfig` options `aquireTimeout` **(Possibly Breaking)**
 * Added `poolConfig` options `log`
 * `idleTimeoutMillis` renamed to `idleTimeout` **(Possibly Breaking)**
 * The `ConnectionPool` `'error'` event added
 * The behavior of the err parameter of the callback passed to `acquire()` has changed. It only returns errors related to acquiring a connection not Tedious Connection errors. Connection errors can happen anytime the pool is being filled and could go unnoticed if only passed the the callback. Subscribe to the `'error'` event on the pool to be notified of all connection errors. **(Possibly Breaking)**
 * `PooledConnection` object removed. 

## Version 0.2.x Breaking Changes
* To acquire a connection, call on `acquire()` on a `ConnectionPool` rather than `requestConnection()`.
* After acquiring a `PooledConnection`, do not wait for the `'connected'` event. The connection is received connected.
* Call `release()` on a `PooledConnection` to release the it back to the pool. `close()` permenantly closes the connection (as `close()` behaves in in tedious).
