function send(connection, data) {
    try {
        connection.send(JSON.stringify(data));
    } catch (err) {
        console.error('Error sending message:', err);
    }
}
module.exports = send;
