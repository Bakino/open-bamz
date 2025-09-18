const { Server } = require('socket.io');

let _io;

function initWebSocket(server){
    _io = new Server(server);
    
    // handle incoming connections from clients
    _io.on('connection', function(socket) {
        // once a client has connected, we expect to get a ping from them saying what room they want to join
        socket.on('joinRoom', function(room) {
            socket.join(room);
        });
        socket.on('leaveRoom', function(room) {
            socket.leave(room) ;
        });
    });
}

function io(){
    return _io ;
}

module.exports = {
    initWebSocket,
    io
};