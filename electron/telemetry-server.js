const WebSocket = require("ws");

const {
  nextTelemetry,
  setCommand
} = require("./telemetry-simulator");

function startTelemetryServer() {

  const wss =
    new WebSocket.Server({
      port: 8787
    });

  console.log(
    "Telemetry WebSocket listening on ws://127.0.0.1:8787"
  );

  wss.on("connection", (socket) => {

    console.log(
      "Dashboard connected"
    );

    /*
     * Send initial telemetry
     */

    socket.send(
      JSON.stringify(
        nextTelemetry()
      )
    );

    /*
     * RECEIVE COMMANDS
     */

    socket.on("message", (message) => {

      try {

        const command =
          JSON.parse(
            message.toString()
          );

        setCommand(command);

      } catch (error) {

        console.error(
          "Invalid command:",
          error
        );

      }

    });

    /*
     * TELEMETRY LOOP
     */

    const timer =
      setInterval(() => {

        if (
          socket.readyState ===
          WebSocket.OPEN
        ) {

          socket.send(
            JSON.stringify(
              nextTelemetry()
            )
          );

        }

      }, 200);

    /*
     * CLEANUP
     */

    socket.on("close", () => {

      clearInterval(timer);

      console.log(
        "Dashboard disconnected"
      );

    });

  });

}

module.exports = {
  startTelemetryServer
};