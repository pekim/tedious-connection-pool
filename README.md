# tedious-connection-pool
A simple connection pool for [tedious](http://github.com/pekim/tedious).

## Example
The only difference from the regular tedious API is how the connection is obtained and released. Once a Connection object has been acquired, the tedious API can be used with the connection as normal.

```javascript
var ConnectionPool = require('tedious-connection-pool');

var pool = new ConnectionPool(poolConfig, connectionConfig);

pool.acquire(function (err, connection) {
  if(!err) {
    var request = new Request('select 42', function(err, rowCount) {
      assert.strictEqual(rowCount, 1);
    
      // Release the connection back to the pool.
      connection.release();
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns[0].value, 42);
    });

    connection.execSql(request);
  }
});
```

When the connection is released it is returned to the pool.
It is then available to be reused.

##Class: ConnectionPool

### new ConnectionPool(poolConfig, connectionConfig)

* `poolConfig` {Object} the configuration for [generic-pool](https://github.com/coopernurse/node-pool) (see link for full list of arguments)
  * `max` {Number} The maximum number of connections there can be in the pool. Default = `10`
  * `min` {Number} The minimun of connections there can be in the pool. Default = `0`
  * `idleTimeoutMillis` {Number} The Number of milliseconds before closing an unused connection. Default = `30000`
  
* `connectionConfig` {Object} The same configuration that would be used to [create a
  tedious Connection](http://pekim.github.com/tedious/api-connection.html#function_newConnection).

### connectionPool.acquire(callback)

* `callback` {Function} Callback function
  * `error` {Error Object}
  * `connection` {Object} A [Connection](http://pekim.github.com/tedious/api-connection.html)

### connectionPool.drain(callback)

* `callback` {Function} Callback function

##Class: PooledConnection
* An extension of the tedious [Connection](http://pekim.github.com/tedious/api-connection.html) object.

### pooledConnection.release()

## Version 0.2.x Breaking Changes
* To acquire a connection, call on acquire() on a ConnectionPool rather than requestConnection().
* After acquiring a PooledConnection, do not wait for the 'connected' event. The connection is received connected.
* Call release() on a PooledConnection to release the it back to the pool. close() permenantly closes the connection (as close() behaves in in tedious).