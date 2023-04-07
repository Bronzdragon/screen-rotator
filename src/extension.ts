'use strict'

const {St, GLib, Clutter, Gio} = imports.gi;
const Main = imports.ui.main;

const PanelMenu = imports.ui.panelMenu

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

</interface></node>`
class Extension {

  #mutterProxy = createAsyncProxy<DisplayConfigProxyMixin>(
    DisplayConfigInterface,
    'org.gnome.Shell',
    '/org/gnome/Mutter/DisplayConfig'
  )

  // _uuid: string
  #signalHandle?: number
  #configSerial = 0
  #logicalMonitors: LogicalMonitor[] = []
  #physicalMontors: monitor[] = []

  // UI
  leftButton?: imports.gi.St.Button
  rightButton?: imports.gi.St.Button

  async enable() {
    // Set up monitor info.
    const proxy = await this.#mutterProxy
    this.#signalHandle = proxy.connectSignal('MonitorsChanged', async () => {
      try {
        this.onMonitorChange()
      } catch (error) {
        if(!(error instanceof Error)) { throw error }
        logError(error, "Monitors changed, cannot fetch new signal.")
      }
    })
    this.onMonitorChange() // Fetch first time monitor info
    
    // Create UI
    this.leftButton = Extension.createButton('left', () => {
      this.getPrimaryMonitor()?.rotate(RotateDirection.counterclockwise)
      this.applyCurrentMonitorConfig()
    })
    this.rightButton = Extension.createButton('right', () => {
      this.getPrimaryMonitor()?.rotate(RotateDirection.clockwise)
      this.applyCurrentMonitorConfig()
    })

    Main.panel._rightBox.insert_child_at_index(this.leftButton, 0)
    Main.panel._rightBox.insert_child_at_index(this.rightButton, 1)
  }

  async disable() {
    // Destroy UI
    if(this.leftButton) {
      Main.panel._rightBox.remove_child(this.leftButton)
    }
    if(this.rightButton) {
      Main.panel._rightBox.remove_child(this.rightButton)
    }

    // Disconnect proxy
    if(this.#signalHandle) {
      const proxy = await this.#mutterProxy
      proxy.disconnectSignal(this.#signalHandle)
    }
  }

  async onMonitorChange() {
    const proxy = await this.#mutterProxy

    proxy.GetCurrentStateRemote((result) => {
      const [serial, physicalMonitors, logicalMonitors] = result
      this.#configSerial = serial
      this.#physicalMontors = physicalMonitors
      this.#logicalMonitors = logicalMonitors.map(mon => LogicalMonitor.fromGetState(mon))
    });

  }

  async applyCurrentMonitorConfig() {
    const method = applyDuration.temporary
    const logicalMonitors = this.#logicalMonitors.map(monitor => monitor.toConfigReady(this.#physicalMontors))

    try {
      const proxy = await this.#mutterProxy
      proxy.ApplyMonitorsConfigRemote(this.#configSerial, method, logicalMonitors, {})
    } catch (error) {
      logError(error as Error)
    }
  }

  getPrimaryMonitor() {
    return this.#logicalMonitors.find(({primary}) => primary)
  }
  
  static createButton(orientation: 'left' | 'right', callback: () => void) {
    const button = new St.Button();
    const icon = this.getIcon(orientation)

    button.set_child(icon)
    button.connect('clicked', callback)

    return button
  }

  static getIcon(orientation: 'left' | 'right') {
    return new St.Icon({
      gicon: new Gio.ThemedIcon({names: [`object-rotate-${orientation}-symbolic`]}),
      style_class: 'system-status-icon'
    })
  }
}

class LogicalMonitor {
  constructor(
    public x: number,
    public y: number,
    public scale: number,
    public transform: number,
    public primary: boolean,
    public connectors: string[],
  ) { }

  rotate(amount = RotateDirection.clockwise) {
    this.transform = (this.transform + amount) % 4
  }

  static fromGetState([x, y, scale, tranform, primary, monitorsInUse]: getStateLogicalMonitor): LogicalMonitor {
    const connectors = monitorsInUse.map(([connector]) => connector)

    return new LogicalMonitor(x, y, scale, tranform, primary, connectors);
  }

  toConfigReady(availableMonitors: monitor[]): ApplyMonitorsConfigLoglicalMonitor {
    const sparseMonitorList = this.connectors.map<ApplyMonitorsConfigPhysicalMonitor | null>(connector => {
      const physicalMonitor = availableMonitors.find(monitor => monitor[0][0] === connector)
      if (!physicalMonitor) return null

      const currentMode = physicalMonitor[1].find(mode => mode[6]["is-current"])
      if (!currentMode) return null

      return [connector, currentMode[0], {}]
    })

    const monitorList = sparseMonitorList.filter((monitor): monitor is ApplyMonitorsConfigPhysicalMonitor => monitor !== null)

    const config: ApplyMonitorsConfigLoglicalMonitor = [
      this.x, this.y, this.scale, this.transform, this.primary, monitorList
    ]

    return config
  }
}

function init () {
  return new Extension();
}

function createAsyncProxy<ExtraStuff>(xml: string, name: string, object: string, { bus = Gio.DBus.session, cancellable = null, flags = Gio.DBusProxyFlags.NONE } = {}): Promise<(typeof Gio.DBusProxy) & ExtraStuff> {
  const proxyWrapper = Gio.DBusProxy.makeProxyWrapper<ExtraStuff>(xml)

  return new Promise((resolve, reject) => {
    proxyWrapper(
      bus,
      name,
      object,
      (proxy, error) => {
        if (error !== null) reject(error)
        resolve(proxy!) // Can guarantee proxy has a value if the error is not null
      },
      cancellable,
      flags,
    )
  })
}

function createHeader(text = '', minLength = 30) {
  text = text.toLocaleUpperCase()

  // Min length of 4 beyond the word length to fit '= ' and ' =' before and after
  const width = Math.max(text.length + 4, minLength)
  const middleWidth = Math.floor((width - text.length - 2) / 2)

  const fullLine = '='.repeat(width)
  const side = '='.repeat(middleWidth)
  const centre = ` ${text}${text.length % 2 === 0 ? ' ' : '  '}`

  return `\n${fullLine}\n${side}${centre}${side}\n${fullLine}`
}

// ----- TYPES -----

type ExtensionMeta = {
  metadata: {
    'uuid': string,
    'name': string,
    'description': string,
    'shell-version': string,
    'url': string,
    'version': number,
    'gettext-domain'?: string,
    'settings-schema'?: typeof Gio.SettingsSchema,
    'session-modes'?: ['user', 'unlock-dialog'?, 'gdm'?]
  },
  uuid: string,
  type: number,
  dir: typeof Gio.File,
  path: string,
  error: string,
  hasPrefs: boolean,
  hasUpdate: boolean,
  canChange: boolean,
  sessionModes: ['user', 'unlock-dialog'?, 'gdm'?],
}

type monitorMode = [
  string, // id (s)
  number, // width (i)
  number, // height (i)
  number, // refresh rate (d)
  number, // preferred scale (d)
  number[], // supported scales (ad)
  {
    'is-current': boolean,
    'is-preferred': boolean,
    'is-interlaced': boolean,
  }
]
type monitor = [
  [
    string, // connector name (s)
    string, // vendor name (s)
    string, // product name (s)
    string, // product serial (s)
  ],
  monitorMode[], // available modes (a(siiddada{sv}))
  {
    'width-mm'?: number,
    'height-mm'?: number,
    'is-underscanning'?: boolean,
    'max-screen-size'?: [number, number],
    'is-builtin'?: boolean,
    'display-name'?: string,
    'privacy-screen-state'?: [boolean, boolean]
  }
]

type getStateLogicalMonitor = [
  number, // x (i)
  number, // y (i)
  number, // scale (d)
  number, // transform (u)
  boolean, // primary (b)
  Array<[
    string, // connector name (s)
    string, // vendor name (s)
    string, // product name (s)
    string, // serial (s)
  ]>, // monitors (a(sss))
  {}, // properties (a{sv})
]

type getCurrentStateArgs = [
  number,   // Serial (u)
  monitor[], // Monitors (a((ssss)a(siiddada{sv})a{sv}))
  getStateLogicalMonitor[], // Logical monitors (a(iiduba(ssss)a{sv}))
  {
    'layout-mode'?: number,
    'supports-changing-layout-mode'?: boolean,
    'global-scale-required'?: boolean,
    'legacy-ui-scaling-factor'?: number,
  },
]

type ApplyMonitorsConfigPhysicalMonitor = [
  string, // connector (s)
  string, // monitor mode ID (s)
  {
    'enable_underscanning'?: boolean
  } // properties a{sv}
]

type ApplyMonitorsConfigLoglicalMonitor = [
  number, // x (i)
  number, // y (i)
  number, // scale (d)
  number, // transform (u)
  boolean, // primary (b)
  ApplyMonitorsConfigPhysicalMonitor[] // list of monitors (a(ssa{sv}))
]

enum applyDuration {
  verifyOnly = 0,
  temporary = 1,
  persistent = 2,
}

type proxyCallback<T> = (returnValue: T, ErrorObj: Error, fdList: typeof Gio.UnixFDList) => void

type DisplayConfigProxyMixin = {
  GetCurrentStateRemote(callback: proxyCallback<getCurrentStateArgs>): void
  ApplyMonitorsConfigRemote(
    serial: number,
    method: applyDuration, // 0 verify, 1 temporary, 2 persistent
    logicalMontors: readonly ApplyMonitorsConfigLoglicalMonitor[],
    properties: ({ 'layout-mode'?: number }),
    callback?: proxyCallback<void>,
  ): void

  connectSignal: (signalName: string, callback: (proxy: any, nameOnwer?: string, args?: string[]) => void) => number
  disconnectSignal: (signalHandle: number) => void
}

enum RotateDirection {
  counterclockwise = 1,
  half = 2,
  clockwise = 3,
  full = 4,
}