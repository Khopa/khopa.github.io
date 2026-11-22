// Runs the original level scripts (Lua) with fengari, exposing the same
// `dwarf.*` API as DwarvesManagerLuaApi.java.
const F = () => window.fengari;

export class LevelScript {
  constructor(code, api) {
    const { lua, lauxlib, lualib, to_luastring } = F();
    this.L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(this.L);
    const L = this.L;
    lua.lua_newtable(L);
    for (const [name, fn] of Object.entries(api)) {
      lua.lua_pushjsfunction(L, (L) => {
        const n = lua.lua_gettop(L);
        const args = [];
        for (let i = 1; i <= n; i++) args.push(this.toJS(i));
        let ret;
        try {
          ret = fn(...args);
        } catch (e) {
          console.error('dwarf.' + name, e);
        }
        if (ret === undefined || ret === null) return 0;
        this.push(ret);
        return 1;
      });
      lua.lua_setfield(L, -2, to_luastring(name));
    }
    lua.lua_setglobal(L, to_luastring('dwarf'));
    if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== 0 || lua.lua_pcall(L, 0, 0, 0) !== 0) {
      console.error('Lua load error', this.popError());
    }
  }
  toJS(i) {
    const { lua } = F();
    const L = this.L;
    switch (lua.lua_type(L, i)) {
      case lua.LUA_TNUMBER: return lua.lua_tonumber(L, i);
      case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, i);
      case lua.LUA_TSTRING: return lua.lua_tojsstring(L, i);
      default: return null;
    }
  }
  push(v) {
    const { lua, to_luastring } = F();
    if (typeof v === 'number') lua.lua_pushnumber(this.L, v);
    else if (typeof v === 'boolean') lua.lua_pushboolean(this.L, v);
    else if (Array.isArray(v)) {
      lua.lua_createtable(this.L, v.length, 0);
      v.forEach((x, k) => {
        lua.lua_pushnumber(this.L, x);
        lua.lua_rawseti(this.L, -2, k + 1);
      });
    } else lua.lua_pushstring(this.L, to_luastring(String(v)));
  }
  popError() {
    const { lua } = F();
    const msg = lua.lua_tojsstring(this.L, -1);
    lua.lua_pop(this.L, 1);
    return msg;
  }
  call(fname, ...args) {
    const { lua, to_luastring } = F();
    const L = this.L;
    lua.lua_getglobal(L, to_luastring(fname));
    if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) {
      lua.lua_pop(L, 1);
      return;
    }
    for (const a of args) this.push(a);
    if (lua.lua_pcall(L, args.length, 0, 0) !== 0) console.error(`Lua ${fname}():`, this.popError());
  }
  get(name) {
    const { lua, to_luastring } = F();
    lua.lua_getglobal(this.L, to_luastring(name));
    const v = this.toJS(-1);
    lua.lua_pop(this.L, 1);
    return v;
  }
  set(name, v) {
    const { lua, to_luastring } = F();
    this.push(v);
    lua.lua_setglobal(this.L, to_luastring(name));
  }
  init() {
    this.call('init');
  }
  setup() {
    this.call('setup');
  }
  run() {
    this.call('run');
  }
  event(id, p1, p2) {
    this.call('onEvent', id, p1 == null ? 'null' : String(p1), p2 == null ? 'null' : String(p2));
  }
  getProgression() {
    return this.get('progression') || 0;
  }
  setProgression(v) {
    this.set('progression', v);
  }
}
