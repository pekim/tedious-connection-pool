'use strict';
var Connection = require('tedious').Connection;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

Connection.prototype.release = function() {
    this.pool.release(this);
};

var PENDING = 0;
var FREE = 1;
var USED = 2;
var RETRY = 3;

function ConnectionPool(poolConfig, connectionConfig) {
    this.connections = [];
    this.waiting = [];
    this.connectionConfig = connectionConfig;

    this.max = poolConfig.max || 50;

    this.min = poolConfig.min || 10;

    this.idleTimeout = !poolConfig.idleTimeout && poolConfig.idleTimeout !== false
        ? 300000 //5 min
        : poolConfig.idleTimeout;

    this.retryDelay = !poolConfig.retryDelay && poolConfig.retryDelay !== false
        ? 5000
        : poolConfig.retryDelay;

    this.acquireTimeout = !poolConfig.acquireTimeout && poolConfig.acquireTimeout !== false
        ? 60000 //1 min
        : poolConfig.acquireTimeout;

    if (poolConfig.log) {
        if (Object.prototype.toString.call(poolConfig.log) == '[object Function]')
            this.log = poolConfig.log;
        else {
            this.log = function(text) {
                console.log('Tedious-Connection-Pool: ' + text);
            };
        }
    } else {
        this.log = function() {};
    }
    
    this.drained = false;

    setTimeout(fill.bind(this), 4);
}

util.inherits(ConnectionPool, EventEmitter);

function createConnection(pooled) {
    if (this.drained) //pool has been drained
        return;

    var self = this;

    this.log('creating connection');
    var connection = new Connection(this.connectionConfig);
    connection.pool = this;
    if (pooled) {
        pooled.con = connection;
        pooled.status = PENDING;
    } else {
        pooled = {
            con: connection,
            status: PENDING
        };

        this.connections.push(pooled);
    }

    var handleError = function(err) {
        self.log('connection closing because of error');
        self.emit('error', err);

        pooled.status = RETRY;
        pooled.con = undefined;
        connection.removeAllListeners('end');
        connection.close();

        setTimeout(createConnection.bind(self, pooled), self.retryDelay);
    };

    connection.on('connect', function (err) {
        self.log('connection connected');
        if (self.drained) { //pool has been drained
            self.log('connection closing because pool is drained');
            connection.close();
            return;
        }

        if (err) {
            handleError(err);
            return;
        }

        var waiter = self.waiting.shift();
        if (waiter !== undefined)
            setUsed.call(self, pooled, waiter);
        else
            setFree.call(self, pooled);
    });

    connection.on('error', handleError);

    connection.on('end', function () {
        self.log('connection ended');
        if (self.drained) //pool has been drained
            return;

        for (var i = self.connections.length - 1; i >= 0; i--) {
            if (self.connections[i].con === connection) {
                self.connections.splice(i, 1);
                fill.call(self);
                return;
            }
        }
    });
}

function fill() {
    if (this.drained) //pool has been drained
        return;

    var available = 0;
    for (var i = this.connections.length - 1; i >= 0; i--) {
        if (this.connections[i].status !== USED) {
            available++;
        }
    }

    var amount = Math.min(
        this.max - this.connections.length, //max that can be created
        this.waiting.length - available); //how many are needed, minus how many are available

    amount = Math.max(
        this.min - this.connections.length, //amount to create to reach min
        amount);

    if (amount > 0)
        this.log('filling ' + amount);

    for (i = 0; i < amount; i++)
        createConnection.call(this);
}

ConnectionPool.prototype.acquire = function (callback) {
    if (this.drained) //pool has been drained
        return;

    var self = this;
    var free;

    //look for free connection
    var l = this.connections.length;
    for (var i = 0; i < l; i++) {
        var pooled = this.connections[i];

        if (pooled.status === FREE) {
            free = pooled;
            break;
        }
    }

    var waiter = {
        callback: callback
    };

    if (free === undefined) { //no valid connection found
        if (this.acquireTimeout) {

            waiter.timeout = setTimeout(function () {
                for (var i = self.waiting.length - 1; i >= 0; i--) {
                    var waiter2 = self.waiting[i];

                    if (waiter2.timeout === waiter.timeout) {
                        self.waiting.splice(i, 1);
                        waiter.callback(new Error('Acquire Timeout'));
                        return;
                    }
                }
            }, this.acquireTimeout);
        }

        this.waiting.push(waiter);
        fill.call(this);
    } else {
        setUsed.call(this, free, waiter);
    }
};

function setUsed(pooled, waiter) {
    pooled.status = USED;
    if (pooled.timeout)
        clearTimeout(pooled.timeout);
    if (waiter.timeout)
        clearTimeout(waiter.timeout);
    waiter.callback(null, pooled.con);
}

function setFree(pooled) {
    var self = this;

    pooled.status = FREE;
    pooled.timeout = setTimeout(function() {
        self.log('closing idle connection');
        pooled.con.close();
    }, this.idleTimeout);
}

ConnectionPool.prototype.release = function(connection) {
    if (this.drained) //pool has been drained
        return;

    var waiter = this.waiting.shift();

    if (waiter !== undefined) {
        if (waiter.timeout)
            clearTimeout(waiter.timeout);
        waiter.callback(null, connection);
    } else {
        for (var i = this.connections.length - 1; i >= 0; i--) {
            var pooled = this.connections[i];
            if (pooled.con === connection) {
                setFree.call(this, pooled);
                break;
            }
        }
    }
};

ConnectionPool.prototype.drain = function () {
    this.log('draining pool');
    if (this.drained) //pool has been drained
        return;

    this.drained = true;

    for (var i = this.connections.length - 1; i >= 0; i--) {
        var pooled = this.connections[i];
        pooled.con.close();
        if (pooled.timeout)
            clearTimeout(pooled.timeout);
    }

    for (i = this.waiting.length - 1; i >= 0; i--) {
        var waiter = this.waiting[i];
        if (waiter.timeout)
            clearTimeout(waiter.timeout);
    }

    this.connections = null;
    this.waiting = null;
};

module.exports = ConnectionPool;
