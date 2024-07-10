"use strict";
import type {} from "@girs/gio-2.0";
import type {} from "@girs/st-14";

import Gio from "gi://Gio?version=2.0";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

const DisplayConfigInterface = `<node><interface name='org.gnome.Mutter.DisplayConfig'>

    <!-- Methods -->
    <method name="GetCurrentState">
      <arg name="serial" direction="out" type="u" />
      <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />
      <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />
      <arg name="properties" direction="out" type="a{sv}" />
    </method>
    <method name="ApplyMonitorsConfig">
      <arg name="serial" direction="in" type="u" />
      <arg name="method" direction="in" type="u" />
      <arg name="logical_monitors" direction="in" type="a(iiduba(ssa{sv}))" />
      <arg name="properties" direction="in" type="a{sv}" />
    </method>

    <!-- Signals -->
    <signal name='MonitorsChanged'></signal>

</interface></node>`;

export default class Extension {
  #mutterProxy = createAsyncProxy<DisplayConfigProxyMixin>(
    DisplayConfigInterface,
    "org.gnome.Shell",
    "/org/gnome/Mutter/DisplayConfig"
  );

  #signalHandle?: number;
  #configSerial = 0;
  #logicalMonitors: LogicalMonitor[] = [];
  #physicalMonitors: PhysicalMonitor[] = [];

  // UI
  leftButton?: St.Button;
  rightButton?: St.Button;

  async enable() {
    // Set up monitor info.
    const proxy = await this.#mutterProxy;
    this.#signalHandle = proxy.connectSignal("MonitorsChanged", async () => {
      try {
        this.onMonitorChange();
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        logError(error, "Monitors changed, cannot fetch new signal.");
      }
    });
    this.onMonitorChange(); // Fetch first time monitor info

    // Create UI
    this.leftButton = Extension.createButton("left", () => {
      console.log(this.getPrimaryMonitor());
      this.rotateAllMonitors(RotateDirection.counterClockwise)
      this.applyCurrentMonitorConfig();
    });
    this.rightButton = Extension.createButton("right", () => {
      console.log(this.#logicalMonitors);
      this.rotateAllMonitors(RotateDirection.clockwise)
      this.applyCurrentMonitorConfig();
    });
    // @ts-ignore
    Main.panel._rightBox.insert_child_at_index(this.leftButton!, 0);
    // @ts-ignore
    Main.panel._rightBox.insert_child_at_index(this.rightButton!, 1);
  }

  async disable() {
    // Destroy UI
    if (this.leftButton) {
      // @ts-ignore
      Main.panel._rightBox.remove_child(this.leftButton);
    }
    if (this.rightButton) {
      // @ts-ignore
      Main.panel._rightBox.remove_child(this.rightButton);
    }

    // Disconnect proxy
    if (this.#signalHandle) {
      const proxy = await this.#mutterProxy;
      proxy.disconnectSignal(this.#signalHandle);
    }
  }

  async onMonitorChange() {
    const proxy = await this.#mutterProxy;

    proxy.GetCurrentStateRemote((result) => {
      const [serial, physicalMonitors, logicalMonitors] = result;
      this.#configSerial = serial;
      this.#physicalMonitors = physicalMonitors;
      this.#logicalMonitors = logicalMonitors.map(
        (mon: getStateLogicalMonitor) => LogicalMonitor.fromGetState(mon)
      );
    });
  }

  async applyCurrentMonitorConfig() {
    const method = applyDuration.temporary;
    const logicalMonitors = this.#logicalMonitors.map((monitor) =>
      monitor.toConfigReady(this.#physicalMonitors)
    );

    try {
      const proxy = await this.#mutterProxy;
      proxy.ApplyMonitorsConfigRemote(
        this.#configSerial,
        method,
        logicalMonitors,
        {}
      );
    } catch (error) {
      logError(error as Error);
    }
  }

  getPrimaryMonitor() {
    return this.#logicalMonitors.find(({ primary }) => primary);
  }

  getScreenSizeByConnector(connector: string): { width: number; height: number } {
    const physicalMonitor = this.#physicalMonitors.find(
      ([info]) => info[0] === connector
    );
    if (!physicalMonitor) return { width: 0, height: 0 };

    const activeMode: MonitorMode | undefined = physicalMonitor[1].find(
      (mode) => mode[6]["is-current"]
    );
    if (!activeMode) return { width: 0, height: 0 };

    const [_, width, height] = activeMode;
    return { width, height };
  }

  getHitboxAllScreens() {
    return this.#logicalMonitors
      .map((logical) => {
        const sizes = logical.connectors.map((connector) => this.getScreenSizeByConnector(connector));
        if (sizes.some((size) => size.width !== sizes[0].width || size.height !== sizes[0].height)) {
          const error = new Error(
            "Not all displays connected to this display are the same size. Cannot rotate."
          );
          logError(error);
          return error;
        }

        const { width, height } = sizes[0];

        return new Box(logical.x, logical.y, width, height);
      })
      .filter((box): box is Box => box instanceof Box)
      .reduce((prev, curr) => prev.extend(curr));
  }

  rotateAllMonitors(direction: RotateDirection) {
    if (direction === RotateDirection.full) return;

    const hitbox = this.getHitboxAllScreens();
    const x_pivot = hitbox.x + (hitbox.width / 2);
    const y_pivot = hitbox.y + (hitbox.height / 2);

    console.log("Hitbox: ", hitbox);
    const offset = (hitbox.height - hitbox.width) / 2;


    for (const logical of this.#logicalMonitors){
      // Calculate new X/Y coordinates
      const {width, height} = this.getScreenSizeByConnector(logical.connectors[0])
      if (direction === RotateDirection.counterClockwise) {
        const newX = x_pivot + logical.y - y_pivot;
        logical.y = y_pivot + -(logical.x - x_pivot) - width
        logical.x = newX;
        logical.rotate(RotateDirection.counterClockwise)
      } else {
        const newY = y_pivot + logical.x - x_pivot;
        logical.x = x_pivot + -(logical.y - y_pivot) - height;
        logical.y = newY;
        logical.rotate(RotateDirection.clockwise)
      }
      logical.x += offset;
      logical.y -= offset;
    }

    // ... move all monitors so that they're at 0,0
    const new_hitbox = this.getHitboxAllScreens();

    const x_offset = -new_hitbox.x;
    const y_offset = -new_hitbox.y;
    for (const logical of this.#logicalMonitors){
      logical.x += x_offset;
      logical.y += y_offset;
    }

    if (direction == RotateDirection.half) {
      // Just rotate it twice to keep it simple.
      this.rotateAllMonitors(RotateDirection.clockwise);
    }
  }

  static createButton(orientation: "left" | "right", callback: () => void) {
    const button = new St.Button();
    const icon = this.getIcon(orientation);

    button.set_child(icon);
    button.connect("clicked", callback);

    return button;
  }

  static getIcon(orientation: "left" | "right") {
    return new St.Icon({
      gicon: new Gio.ThemedIcon({
        names: [`object-rotate-${orientation}-symbolic`],
      }),
      style_class: "system-status-icon",
    });
  }
}

class LogicalMonitor {
  constructor(
    public x: number,
    public y: number,
    public scale: number,
    public transform: number,
    public primary: boolean,
    public connectors: string[]
  ) {}

  rotate(amount = RotateDirection.clockwise) {
    const isFlipped = this.transform > 3;
    this.transform = ((this.transform + amount) % 4) + (isFlipped ? 4 : 0);
  }

  static fromGetState([
    x,
    y,
    scale,
    transform,
    primary,
    monitorsInUse,
  ]: getStateLogicalMonitor): LogicalMonitor {
    const connectors = monitorsInUse.map(([connector]) => connector);

    return new LogicalMonitor(x, y, scale, transform, primary, connectors);
  }

  toConfigReady(
    availableMonitors: PhysicalMonitor[]
  ): ApplyMonitorsConfigLogicalMonitor {
    const sparseMonitorList =
      this.connectors.map<ApplyMonitorsConfigPhysicalMonitor | null>(
        (connector) => {
          const physicalMonitor = availableMonitors.find(
            (monitor) => monitor[0][0] === connector
          );
          if (!physicalMonitor) return null;

          const currentMode = physicalMonitor[1].find(
            (mode) => mode[6]["is-current"]
          );
          if (!currentMode) return null;

          return [connector, currentMode[0], {}];
        }
      );

    const monitorList = sparseMonitorList.filter(
      (monitor): monitor is ApplyMonitorsConfigPhysicalMonitor =>
        monitor !== null
    );

    const config: ApplyMonitorsConfigLogicalMonitor = [
      this.x,
      this.y,
      this.scale,
      this.transform,
      this.primary,
      monitorList,
    ];

    return config;
  }
}

class Box {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0
  ) {}

  extend(otherBox: Box) {
    return new Box(
      Math.min(this.x, otherBox.x), // x
      Math.min(this.y, otherBox.y), // y
      Math.max(this.x + this.width, otherBox.x + otherBox.width) - this.x, // width
      Math.max(this.y + this.height, otherBox.y + otherBox.height) - this.y // height
    );
  }
}

function createAsyncProxy<ExtraStuff>(
  xml: string,
  name: string,
  object: string,
  {
    bus = Gio.DBus.session,
    cancellable = null,
    flags = Gio.DBusProxyFlags.NONE,
  } = {}
): Promise<typeof Gio.DBusProxy & ExtraStuff> {
  const proxyWrapper = Gio.DBusProxy.makeProxyWrapper<ExtraStuff>(xml);

  return new Promise((resolve, reject) => {
    proxyWrapper(
      bus,
      name,
      object,
      (proxy, error) => {
        if (error !== null) reject(error);
        // @ts-ignore
        resolve(proxy!); // Can guarantee proxy has a value if the error is not null
      },
      cancellable,
      flags
    );
  });
}

type MonitorMode = [
  string, // id (s)
  number, // width (i)
  number, // height (i)
  number, // refresh rate (d)
  number, // preferred scale (d)
  number[], // supported scales (ad)
  {
    "is-current": boolean;
    "is-preferred": boolean;
    "is-interlaced": boolean;
  }
];

type PhysicalMonitor = [
  [
    string, // connector name (s)
    string, // vendor name (s)
    string, // product name (s)
    string // product serial (s)
  ],
  MonitorMode[], // available modes (a(siiddada{sv}))
  {
    "width-mm"?: number;
    "height-mm"?: number;
    "is-underscanning"?: boolean;
    "max-screen-size"?: [number, number];
    "is-builtin"?: boolean;
    "display-name"?: string;
    "privacy-screen-state"?: [boolean, boolean];
  }
];

type getStateLogicalMonitor = [
  number, // x (i)
  number, // y (i)
  number, // scale (d)
  number, // transform (u)
  boolean, // primary (b)
  Array<
    [
      string, // connector name (s)
      string, // vendor name (s)
      string, // product name (s)
      string // serial (s)
    ]
  >,
  // monitors (a(sss))
  {} // properties (a{sv})
];

type getCurrentStateArgs = [
  number, // Serial (u)
  PhysicalMonitor[], // Monitors (a((ssss)a(siiddada{sv})a{sv}))
  getStateLogicalMonitor[], // Logical monitors (a(iiduba(ssss)a{sv}))
  {
    "layout-mode"?: number;
    "supports-changing-layout-mode"?: boolean;
    "global-scale-required"?: boolean;
    "legacy-ui-scaling-factor"?: number;
  }
];

type ApplyMonitorsConfigPhysicalMonitor = [
  string, // connector (s)
  string, // monitor mode ID (s)
  {
    enable_underscanning?: boolean;
  } // properties a{sv}
];

type ApplyMonitorsConfigLogicalMonitor = [
  number, // x (i)
  number, // y (i)
  number, // scale (d)
  number, // transform (u)
  boolean, // primary (b)
  ApplyMonitorsConfigPhysicalMonitor[] // list of monitors (a(ssa{sv}))
];

enum applyDuration {
  verifyOnly = 0,
  temporary = 1,
  persistent = 2,
}

type proxyCallback<T> = (
  returnValue: T,
  ErrorObj: Error,
  fdList: typeof Gio.UnixFDList
) => void;

type DisplayConfigProxyMixin = {
  GetCurrentStateRemote(callback: proxyCallback<getCurrentStateArgs>): void;
  ApplyMonitorsConfigRemote(
    serial: number,
    method: applyDuration, // 0 verify, 1 temporary, 2 persistent
    logicalMonitors: readonly ApplyMonitorsConfigLogicalMonitor[],
    properties: { "layout-mode"?: number },
    callback?: proxyCallback<void>
  ): void;

  connectSignal: (
    signalName: string,
    callback: (proxy: any, nameOwner?: string, args?: string[]) => void
  ) => number;
  disconnectSignal: (signalHandle: number) => void;
};

enum RotateDirection {
  counterClockwise = 1,
  half = 2,
  clockwise = 3,
  full = 4,
}
