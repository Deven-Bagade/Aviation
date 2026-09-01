const {
  app,
  BrowserWindow
} = require("electron");

const path = require("path");

const {
  startTelemetryServer
} = require("./telemetry-server");

let mainWindow;

function createWindow() {

  mainWindow =
    new BrowserWindow({


      width: 1500,
      height: 950,

      minWidth: 1100,
      minHeight: 700,

      backgroundColor: "#071018",

      webPreferences: {

        contextIsolation: true,

        nodeIntegration: false
      }

    });

    mainWindow.webContents.setWindowOpenHandler(() => {
  return {
    action: "allow",
    overrideBrowserWindowOptions: {
      backgroundColor: "#071018",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    }
  };
});
  const devUrl =
    process.env.VITE_DEV_SERVER_URL ||
    "http://127.0.0.1:5173";

  if (!app.isPackaged) {

    mainWindow.loadURL(
      devUrl
    );

  } else {

    mainWindow.loadFile(
      path.join(
        __dirname,
        "..",
        "dist",
        "index.html"
      )
    );

  }

}

app.whenReady().then(() => {

  startTelemetryServer();

  createWindow();

  app.on(
    "activate",
    () => {

      if (
        BrowserWindow
          .getAllWindows()
          .length === 0
      ) {

        createWindow();

      }

    }
  );

});

app.on(
  "window-all-closed",
  () => {

    if (
      process.platform !== "darwin"
    ) {

      app.quit();

    }

  }
);