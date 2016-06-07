# tedious-connection-pool
A connection pool for [tedious](http://github.com/pekim/tedious).

## Installation

    npm install tedious-connection-pool
    
## Description
The only difference from the regular tedious API is how the connection is obtained and released. Rather than creating a connection and then closing it when finished, acquire a connection from the pool and release it when finished. Releasing resets the connection and makes in available for another use.

Once the Tedious Connection object has been acquired, the tedious API can be used with the connection as normal.

## Example

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

//create the pool
var pool = new ConnectionPool(poolConfig, connectionConfig);

pool.on('error', function(err) {
    console.error(err);
});

//acquire a connection
pool.acquire(function (err, connection) {
    if (err) {
        console.error(err);
        return;
    }

    //use the connection as normal
    var request = new Request('select 42', function(err, rowCount) {
        if (err) {
            console.error(err);
            return;
        }

        console.log('rowCount: ' + rowCount);

        //release the connection back to the pool when finished
        connection.release();
    });

    request.on('row', function(columns) {
        console.log('value: ' + columns[0].value);
    });

    connection.execSql(request);
});
```

When you are finished with the pool, you can drain it (close all connections).
```javascript
pool.drain();
```


## Class: ConnectionPool

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
  * `err` {Object} The Error that occurred while trying to acquire a connection, otherwise null.
  * `connection` {Object} A [Connection](http://pekim.github.com/tedious/api-connection.html)

### connectionPool.drain(callback)
Close all pooled connections and stop making new ones. The pool should be discarded after it has been drained.

* `callback()` {Function} Callback function

### connectionPool 'error' {event}
The 'error' event is emitted when a connection fails to connect to the SQL Server.

* `err` {Object} The Error that occurred while trying to connect to the SQL Server.

### connectionPool 'new-connection' {event}
The 'new-connection' event is emitted when a new connection was just created. No other event-handlers are registered yet and it is not yet put into the connection pool at this point.

* `new_con` {Object} The newly created [Connection](http://pekim.github.com/tedious/api-connection.html)

### connectionPool 'new-connection-pooled' {event}
The 'new-connection-pooled' event is emitted after the 'new-connection' event. At this point the internal event-handlers are already registered on the connection and it is already put into the connection pool.

* `new_con` {Object} The newly pooled [Connection](http://pekim.github.com/tedious/api-connection.html)


## Class: Connection
The following method is added to the Tedious [Connection](http://pekim.github.com/tedious/api-connection.html) object.

### Connection.release()
Release the connect back to the pool to be used again

## Changelog

### Version 1.0.0
* No changes from v0.3.9.

### Version 0.3.9
* bug fix only

### Version 0.3.7
* bug fix only

### Version 0.3.6
* bug fix only

### Version 0.3.5
* `poolConfig` option `min` is limited to less than `max`

### Version 0.3.4
* `poolConfig` option `min` supports being set to 0

### Version 0.3.3
* Ignore calls to connection.release() on a connection that has been closed or not part of the connection pool.

### Version 0.3.2
 * Calls connection.reset() when the connection is released to the pool. This is very unlikely to cause anyone trouble.
 * Added a callback argument to connectionPool.drain()

### Version 0.3.0
 * Removed dependency on the `generic-pool` node module.
 * Added `poolConfig` options `retryDelay`
 * Added `poolConfig` options `aquireTimeout` **(Possibly Breaking)**
 * Added `poolConfig` options `log`
 * `idleTimeoutMillis` renamed to `idleTimeout` **(Possibly Breaking)**
 * The `ConnectionPool` `'error'` event added
 * The behavior of the err parameter of the callback passed to `acquire()` has changed. It only returns errors related to acquiring a connection not Tedious Connection errors. Connection errors can happen anytime the pool is being filled and could go unnoticed if only passed the the callback. Subscribe to the `'error'` event on the pool to be notified of all connection errors. **(Possibly Breaking)**
 * `PooledConnection` object removed.

### Version 0.2.x
* To acquire a connection, call on `acquire()` on a `ConnectionPool` rather than `requestConnection()`. **(Breaking)**
* After acquiring a `PooledConnection`, do not wait for the `'connected'` event. The connection is received connected. **(Breaking)**
* Call `release()` on a `PooledConnection` to release the it back to the pool. `close()` permanently closes the connection (as `close()` behaves in in tedious). **(Breaking)**
