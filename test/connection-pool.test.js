var assert = require('assert')
var async = require('async')
var ConnectionPool = require('../lib/connection-pool');
var Request = require('tedious').Request;

var connectionConfig = {
  userName: 'test',
  password: 'test',
  server: 'dev1',
  // options: {
  //   debug: {
  //     packet: true,
  //     data: true,
  //     payload: true,
  //     token: true
  //   }
  // }
};

describe('ConnectionPool', function() {
  describe('one connection', function() {
    var poolConfig = {max: 1, log: false};

    it('should connect, and end', function(done) {
      testPool(poolConfig, poolConfig.max, acquireAndClose, done);
    });

    it('should connect, select, and end', function(done) {
      testPool(poolConfig, poolConfig.max, acquireSelectAndClose, done);
    });
  });

  describe('multiple connections within pool maxSize', function() {
    var poolConfig = {max: 5, log: false};
    var numberOfConnectionsToUse = poolConfig.max;

    it('should connect, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, acquireAndClose, done);
    });

    it('should connect, select, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, acquireSelectAndClose, done);
    });
  });

  describe('connections exceed pool maxSize', function() {
    var poolConfig = {max: 5, log: false};
    var numberOfConnectionsToUse = 20;

    it('should connect, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, acquireAndClose, done);
    });

    it('should connect, select, and end', function(done) {
      testPool(poolConfig, numberOfConnectionsToUse, acquireSelectAndClose, done);
    });
  });
});

function testPool(poolConfig, numberOfConnectionsToUse, useConnectionFunction, done) {
  var pool = new ConnectionPool(poolConfig, connectionConfig);

  function doIt(done) {
    useConnectionFunction(pool, function() {
      done();
    });
  }

  var functions = [];
  for (var f = 0; f < numberOfConnectionsToUse; f++) {
    functions.push(doIt);
  }

  async.parallel(functions, function() {
    pool.drain(function() {
      done();
    });
  });
}

function acquireAndClose(pool, done) {
  pool.acquire(function (err, connection) {
    assert.ok(!err);

    connection.release();
    done();
  });
}

function acquireSelectAndClose(pool, done) {
  pool.acquire(function (err, connection) {
    assert.ok(!err);

    var request = new Request('select 42', function(err, rowCount) {
        assert.strictEqual(rowCount, 1);
        connection.release();
        done();
    });

    request.on('row', function(columns) {
        assert.strictEqual(columns[0].value, 42);
    });

    connection.execSql(request);
  });
}
