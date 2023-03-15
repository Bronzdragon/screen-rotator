'use strict'

const { Gio, GLib /* GObject, St, Clutter, Meta, Gdk, Shell */ } = imports.gi

type ExtensionMeta = {
  metaData: Record<string, any>
  uuid: string
  type: number
  dir: imports.gi.Gio.File
  path: string
  error: string
  hasPrefs: boolean
  hasUpdate: boolean
  canChange: boolean
  sessionModes: string[]
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

/* global imports log logError */
/* exported init */

// const ExtensionUtils = imports.misc.extensionUtils;
const GETTEXT_DOMAIN = 'screen-rotate'

log(createHeader('Creating proxy'))

type crtc = [
  number, // ID (u)
  number, // winsys_id (x)
  number, // x (i)
  number, // y (i)
  number, // width (i)
  number, // height (i)
  number, // current mode (i)
  number, // current transform (u)
  number[], // possible transforms (au)
  Record<string, any>[] // properties (a{sv})
]

type output = [
  number, // ID (u)
  number, // wynsis_id (x)
  number, // current_crtc (i)
  number[], // possible crtcs (au)
  string, // name (s)
  number[], // modes (au)
  number[], // clones (au)
  {
    'vendor'?: string,
    'product'?: string,
    'serial'?: string,
    'display-name'?: string,
    'backlight'?: number,
    'primary'?: boolean,
    'presentation'?: boolean,
  }
]
type mode = [
  number, // ID (u)
  number, // winsys_id (x)
  number, // width (u)
  number, // height (u)
  number, // frequency (d)
  number, // flags (u)
]

type getResourcesArgs = [number, crtc[], output[], mode[], number, number]

const DisplayConfigInterface = `<node><interface name='org.gnome.Mutter.DisplayConfig'>
    <method name='ApplyConfiguration'>
      <arg name='serial' direction='in' type='u' />
      <arg name='persistent' direction='in' type='b' />
      <arg name='crtcs' direction='in' type='a(uiiiuaua{sv})' />
      <arg name='outputs' direction='in' type='a(ua{sv})' />
    </method>
    <method name="GetResources">
      <arg name="serial" direction="out" type="u" />
      <arg name="crtcs" direction="out" type="a(uxiiiiiuaua{sv})" />
      <arg name="outputs" direction="out" type="a(uxiausauaua{sv})" />
      <arg name="modes" direction="out" type="a(uxuudu)" />
      <arg name="max_screen_width" direction="out" type="i" />
      <arg name="max_screen_height" direction="out" type="i" />
    </method>
    <signal name='MonitorsChanged'>
    </signal>
</interface></node>`

class CRTC {
  id:number
  winsysId: unknown = null
  x:number; y:number
  width:number; height:number
  currentMode: number
  currentTransform: number
  possibleTransforms: number[]
  properties: Record<string, any>

  constructor (data: crtc) {
    // We expect exactly 10 properties
    if (!Array.isArray(data) || data.length !== 10) { throw new TypeError(`Cannot construct a CRTC from given input: ${JSON.stringify(data)}`) }

    // Copy data out of the array
    [this.id, this.winsysId, this.x, this.y, this.width, this.height, this.currentMode, this.currentTransform, this.possibleTransforms, this.properties] = data

    if (!Number.isInteger(this.id)) { throw new TypeError(`Expected ID to be an integer, got ${this.id}`) }
    if (!this.winsysId) { throw new TypeError(`Expected Winsys ID to have a value, got ${this.winsysId}`) }
    if (!Number.isInteger(this.x)) { throw new TypeError(`Expected x to be an integer, got ${this.x}`) }
    if (!Number.isInteger(this.y)) { throw new TypeError(`Expected y to be an integer, got ${this.y}`) }
    if (!Number.isInteger(this.width)) { throw new TypeError(`Expected width to be an integer, got ${this.width}`) }
    if (!Number.isInteger(this.height)) { throw new TypeError(`Expected height to be an integer, got ${this.height}`) }
    if (!Number.isInteger(this.currentMode)) { throw new TypeError(`Expected current mode to be an integer, got ${this.currentMode}`) }
    if (!Number.isInteger(this.currentTransform)) { throw new TypeError(`Expected current transform to be an integer, got ${this.currentTransform}`) }
    if (!Array.isArray(this.possibleTransforms) || !this.possibleTransforms.every(v => Number.isInteger(v))) { throw new TypeError(`Expected possible transforms to be an integer, got ${this.x}`) }
    if (!this.properties) { throw new TypeError(`Expected a properties object to exist. Instead, got ${this.properties}`) }
  }

  toString () {
    return `ID: ${this.id}. Winsys ID: ${this.winsysId}
    x: ${this.x}, y: ${this.y}
    width: ${this.width}, height: ${this.height}
    current mode: ${this.currentMode}
    Transforms:
      Current: ${this.currentTransform}
      Possible: [ ${this.possibleTransforms.join(', ')} ]
    Other properties: ${JSON.stringify(this.properties)}`
  }
}

class Output {
  constructor(){
    
  }
}

class Extension {
  private _mutterProxy = createAsyncProxy<{
      GetResourcesRemote: (callback: (returnValue:getResourcesArgs, ErrorObj: Error, fdList: imports.gi.Gio.UnixFDList) => void) => void
      connectSignal: (signalName: string, callback: (proxy: any, nameOnwer?: string, args?: string[] ) => void) => void
    }>(
      DisplayConfigInterface,
      'org.gnome.Shell',
      '/org/gnome/Mutter/DisplayConfig'
    )
  _lastSerial = -1
  _crtcs: CRTC[] = []
  _uuid: string

  constructor (uuid: string) {
    this._uuid = uuid
    // ExtensionUtils.initTranslations(GETTEXT_DOMAIN)
  }

  enable () {
    log(createHeader('extension enabled'))
    this._mutterProxy.then(proxy => {
      log('Proxy created. Getting resources...')
      proxy.GetResourcesRemote((returnValue, ErrorObj) => {
        if (ErrorObj) {
          log(`Error fetching resources: ${ErrorObj}`)
        }
        this.onMonitorChange(returnValue)
      })

      proxy.connectSignal('MonitorsChanged', (innerProxy: Awaited<typeof this._mutterProxy>) => {
        innerProxy.GetResourcesRemote((returnValue, ErrorObj) => {
          if (ErrorObj) {
            log(`Error fetching resources: ${ErrorObj}`)
          }
          this.onMonitorChange(returnValue)
        })
      })
    })

    // // Setup UI
    // this._indicator = new Indicator()
    // Main.panel.addToStatusArea(this._uuid, this._indicator, 0, 'right')
  }

  disable () {
    log(createHeader('extension disabled'))
    // this._indicator.destroy()
    // this._indicator = null

    // this._icon.destroy()
    // this._icon = null
  }

  onMonitorChange (resources: getResourcesArgs) {
    log(createHeader('Resources gotten.'))

    if (resources.length < 4) return
    const [serial, crtcs, outputs, modes] = resources

    log(`serial: ${serial}`)
    this._lastSerial = serial

    log('crtcs:')
    this._crtcs = crtcs.map(crtc => new CRTC(crtc))
    log(this._crtcs)

    log('outputs')
    for (const output of outputs) {
      const [id, winsysId, currentCrtc, ...rest] = output

      log(`-\tID: ${id}`)
      log(`\twinsysId (${winsysId}) current CRTC(${currentCrtc}) other (${rest})`)
    }

    log('modes:')
    for (const mode of modes) {
      const [id, winsysId, width, height, frequency, flags] = mode

      log(`-\tID: ${id}`)
      log(`\twinsys ID (${winsysId}) width(${width}) height(${height}) frequency(${frequency}) flags(${flags})`)
    }
  }
}

// eslint-disable-next-line no-unused-vars
function init (meta: ExtensionMeta) {
  log(createHeader('extension started'))
  return new Extension(meta.uuid)
}

function createHeader (text = '', minLength = 30) {
  text = text.toLocaleUpperCase()

  // Min length of 4 beyond the word length to fit '= ' and ' =' before and after
  const width = Math.max(text.length + 4, minLength)
  const middleWidth = Math.floor((width - text.length - 2) / 2)

  const fullLine = '='.repeat(width)
  const side = '='.repeat(middleWidth)
  const centre = ` ${text}${text.length % 2 === 0 ? ' ' : '  '}`

  return `\n${fullLine}\n${side}${centre}${side}\n${fullLine}`
}

function createAsyncProxy<ExtraStuff> (xml: string, name: string, object:string, { bus = Gio.DBus.session, cancellable = null, flags = Gio.DBusProxyFlags.NONE } = {}) {
  const proxyWrapper = Gio.DBusProxy.makeProxyWrapper<ExtraStuff>(xml)

  return new Promise<imports.gi.Gio.DBusProxy & ExtraStuff>((resolve, reject) => {
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

function findLastInSequence<Type>(array: Type[] = [], delegate: (val: Type) => boolean = () => true, startIndex = 0) {
  if (!delegate(array[startIndex])) return -1

  for (let i = startIndex; i < array.length; i++) {
    if (!delegate(array[i])) {
      return i - 1
    }
  }

  return array.length - 1
}

/*const { St, Clutter } = imports.gi
// @ts-ignore
const Main = imports.ui.main

let panelButton: any;

// @ts-ignore
function init() {
    panelButton = new St.Bin({
        style_class : "panel-button"
    });
    let panelButtonText = new St.Label({
        text: "Hello world",
        y_align: Clutter.ActorAlign.CENTER
    });
    panelButton.set_child(panelButtonText)
}

// @ts-ignore
function enable() {
	log(`Hello log`);
    Main.panel._rightBox.insert_child_at_index(panelButton, 0);
}

// @ts-ignore
function disable() {
    Main.panel._rightBox.remove_child(panelButton);
}*/