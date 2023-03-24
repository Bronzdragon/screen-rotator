'use strict'

const { Gio, GLib, St, Clutter, GObject /*, Meta, Gdk, Shell */ } = imports.gi

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

/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const ExtensionUtils = imports.misc.extensionUtils;
const _ = ExtensionUtils.gettext;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;


log(createHeader('Creating proxy'))

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

type DisplayConfigProxyMixin = {
  // GetResourcesRemote: (callback: (returnValue: getResourcesArgs, ErrorObj: Error, fdList: imports.gi.Gio.UnixFDList) => void) => void
  // ApplyConfigurationRemote: (serial: number, persistent: boolean, crtcs: crctOutTupple[], outputs: outputOutTupple[], callback: (returnValue: [], ErrorObj: Error, fdList: imports.gi.Gio.UnixFDList) => void) => void
  GetCurrentStateRemote(callback: (returnValue: getCurrentStateArgs, ErrorObj: Error, fdList: imports.gi.Gio.UnixFDList) => void): void
  ApplyMonitorsConfigRemote(serial: number, method: number, logicalMontors: readonly ApplyMonitorsConfigLoglicalMonitor[], properties: ({ 'layout-mode'?: number }), callback?: (returnValue: never, ErrorObj: Error, fdList: imports.gi.Gio.UnixFDList) => void): void

  connectSignal: (signalName: string, callback: (proxy: any, nameOnwer?: string, args?: string[]) => void) => number
  // disconnectSignal: (signalHandle: number) => void
}

const DisplayConfigInterface = `<node><interface name='org.gnome.Mutter.DisplayConfig'>
    <!-- Methods -->
    <method name="GetResources">
      <arg name="serial" direction="out" type="u" />
      <arg name="crtcs" direction="out" type="a(uxiiiiiuaua{sv})" />
      <arg name="outputs" direction="out" type="a(uxiausauaua{sv})" />
      <arg name="modes" direction="out" type="a(uxuudu)" />
      <arg name="max_screen_width" direction="out" type="i" />
      <arg name="max_screen_height" direction="out" type="i" />
    </method>
    <method name="GetCurrentState">
      <arg name="serial" direction="out" type="u" />
      <arg name="monitors" direction="out" type="a((ssss)a(siiddada{sv})a{sv})" />
      <arg name="logical_monitors" direction="out" type="a(iiduba(ssss)a{sv})" />
      <arg name="properties" direction="out" type="a{sv}" />
    </method>

    <method name='ApplyConfiguration'>
    <arg name='serial' direction='in' type='u' />
    <arg name='persistent' direction='in' type='b' />
    <arg name='crtcs' direction='in' type='a(uiiiuaua{sv})' />
    <arg name='outputs' direction='in' type='a(ua{sv})' />
    </method>
    <method name="ApplyMonitorsConfig">
      <arg name="serial" direction="in" type="u" />
      <arg name="method" direction="in" type="u" />
      <arg name="logical_monitors" direction="in" type="a(iiduba(ssa{sv}))" />
      <arg name="properties" direction="in" type="a{sv}" />
    </method>

    <!-- Signals -->
    <signal name='MonitorsChanged'>
    </signal>
</interface></node>`

enum RotateDirection {
  clockwise = 1,
  half = 2,
  counterclockwise = 3,
  full = 4,
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
    const monitorList = this.connectors.map<ApplyMonitorsConfigPhysicalMonitor | null>(connector => {
      const physicalMonitor = availableMonitors.find(monitor => monitor[0][0] === connector)
      if (!physicalMonitor) return null

      const currentMode = physicalMonitor[1].find(mode => mode[6]["is-current"])
      if (!currentMode) return null

      return [connector, currentMode[0], {}]
    })

    const ml = monitorList.filter((monitor): monitor is ApplyMonitorsConfigPhysicalMonitor => monitor !== null)

    log(`Monitor List: ${JSON.stringify(monitorList)}`)

    const config: ApplyMonitorsConfigLoglicalMonitor = [
      this.x, this.y, this.scale, this.transform, this.primary, ml
    ]

    log(config)

    return config
  }

  toString() {
    return `x: ${this.x}, y: ${this.y}
scale: ${this.scale}
isPrimary: ${this.primary}, transform: ${this.transform}
connectors: ${JSON.stringify(this.connectors)}`
  }
}

const Indicator = GObject.registerClass(class extends PanelMenu.Button {
  constructor(public _rotateClicked: () => void) {
    super()
  }

  _init() {
    super._init(0.0, _('My Shiny Indicator'));

    this.add_child(new St.Icon({
      icon_name: 'face-smile-symbolic',
      style_class: 'system-status-icon',
    }));

    let item = new PopupMenu.PopupMenuItem(_('Show Notification'));
    item.connect('activate', () => {
      this._rotateClicked();
      Main.notify(_('Whatʼs up, folks?'));
    });

    this.menu.addMenuItem(item);
  }
});

class Extension {
  private _mutterProxy = createAsyncProxy<DisplayConfigProxyMixin>(
    DisplayConfigInterface,
    'org.gnome.Shell',
    '/org/gnome/Mutter/DisplayConfig'
  )
  _uuid: string
  _signalHandle?: number
  _serial = 0
  _logicalMonitors: LogicalMonitor[] = []
  _physicalMontors: monitor[] = []

  // UI:
  panelButton: imports.gi.St.Bin
  _indicator = new Indicator(() => {
    log(createHeader('Turning Display'))

    // Rotate monitor
    const primaryMonitor = this._logicalMonitors.find(({ primary }) => primary)! // Can't be null, since every config must have a primary monitor
    primaryMonitor.rotate(RotateDirection.clockwise);

    // Saving config.
    try {
      const configReady = this._logicalMonitors.map(mon => mon.toConfigReady(this._physicalMontors))
      this.setNewMonitorConfig(configReady).catch(logError)
    } catch (error) {
      if (!(error instanceof Error)) { throw error }
      logError(error, 'error applying config');
      Main.notify(_(`Couldn't rotate monitor. Error: ${error.message}`));
    }
  });


  constructor(uuid: string) {
    this._uuid = uuid


    this.panelButton = new St.Bin({
      style_class: "panel-button"
    });
    let panelButtonText = new St.Label({
      text: "Hello world",
      y_align: Clutter.ActorAlign.CENTER
    });
    this.panelButton.set_child(panelButtonText)
  }

  async enable() {
    log(createHeader('extension enabled'))
    // const notification = Gio.Notification.new('MyNotification')
    // Main.notify(notification);

    try {
      const proxy = await this._mutterProxy

      // Connect signal
      this._signalHandle = proxy.connectSignal(
        'MonitorsChanged',
        // @ts-ignore: Unused proxy variable.
        async (innerProxy: Awaited<typeof this._mutterProxy>) => {
          try {
            this.onMonitorChange()
          } catch (error) {
            logError(error as Error, "Monitor change signal happened, but cannot fetch config.")
          }
        })

      // ... and get initial values
      log('Proxy created. Getting resources...')
      this.onMonitorChange()
    } catch (error) {
      logError(error as Error, "Monitor change signal happened, but cannot fetch config.")
    }

    Main.panel.addToStatusArea(this._uuid, this._indicator)
  }

  disable() {
    log(createHeader('extension disabled'))
    this._mutterProxy.then(proxy => {
      if (this._signalHandle !== undefined) {
        proxy.disconnectSignal(this._signalHandle)
      }
    })

    // Destroy UI
    if (this._indicator) { this._indicator.destroy() }
  }

  async onMonitorChange() {
    log(createHeader('Monitor change detected'))
    const proxy = await this._mutterProxy

    proxy.GetCurrentStateRemote((result) => {
      log(createHeader('Got current state!'))

      const [serial, physicalMonitors, logicalMonitors] = result
      this._serial = serial
      this._physicalMontors = physicalMonitors
      this._logicalMonitors = logicalMonitors.map(mon => LogicalMonitor.fromGetState(mon))

      log('serial: ', serial)
      log('logicalMonitors', logicalMonitors)

      // this._logicalMonitors = logicalMonitors
    });

  }

  async setNewMonitorConfig(logicalMonitors: ApplyMonitorsConfigLoglicalMonitor[]) {
    log(createHeader('Setting new config'))

    log(`monitors: ${JSON.stringify(logicalMonitors)}`)

    try {
      const proxy = await this._mutterProxy

      const args = [this._serial, 1, logicalMonitors, {}] as const
      log('args: ', JSON.stringify(args))
      proxy.ApplyMonitorsConfigRemote(...args)
    } catch (error) {
      logError(error as Error)
    }
  }
}

function init(meta: ExtensionMeta) {
  log(createHeader('extension started'))

  ExtensionUtils.initTranslations(meta.metadata["gettext-domain"]!)

  return new Extension(meta.uuid)
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

function createAsyncProxy<ExtraStuff>(xml: string, name: string, object: string, { bus = Gio.DBus.session, cancellable = null, flags = Gio.DBusProxyFlags.NONE } = {}): Promise<imports.gi.Gio.DBusProxy & ExtraStuff> {
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