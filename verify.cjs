// 无外部依赖的回归测试：模拟已观察到的新版附件 DOM 及接口响应。
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/畅课平台资源下载.user.js', 'utf8');

class Element {
    constructor(tag = 'div', className = '', text = '') {
        this.tagName = tag; this.className = className; this.textContent = text;
        this.children = []; this.attrs = {}; this.dataset = {}; this.style = {};
    }
    appendChild(node) { node.parent = this; this.children.push(node); return node; }
    get parentElement() { return this.parent; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
    before(node) { node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this), 0, node); }
    after(node) { node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        const match = (node, part) => {
            const [tag, ...classes] = part.split('.');
            return (!tag || tag === node.tagName) && classes.every(c => node.className.split(' ').includes(c));
        };
        const parts = selector.split(' ');
        const matches = node => {
            if (!match(node, parts.at(-1))) return false;
            let ancestor = node.parent;
            for (let i = parts.length - 2; i >= 0; i--) {
                while (ancestor && !match(ancestor, parts[i])) ancestor = ancestor.parent;
                if (!ancestor) return false;
                ancestor = ancestor.parent;
            }
            return true;
        };
        const found = [];
        const visit = node => { for (const child of node.children) { if (matches(child)) found.push(child); visit(child); } };
        visit(this); return found;
    }
}

const buttonSelector = 'button.tronclass-resource-download';
function row(name, useTitle = true) {
    const result = new Element('div', 'attachment-row');
    const column = result.appendChild(new Element('div', 'attachment-column'));
    const info = column.appendChild(new Element('div', 'file-info'));
    const names = info.appendChild(new Element('div', 'file-name-row'));
    const label = names.appendChild(new Element('span', 'file-name', name.replace(/\.pdf$/, '')));
    if (useTitle) label.setAttribute('tipsy-literal', name);
    names.appendChild(new Element('span', 'file-extension', '.pdf'));
    info.appendChild(new Element('div', 'file-size', '大小:963.18 KB'));
    return result;
}
function setup({late = false, fetcher} = {}) {
    const root = new Element('html');
    const list = new Element('div', 'attachment-body');
    if (!late) root.appendChild(list);
    const requests = [], opened = [], errors = [];
    const events = {};
    const location = {pathname:'/course/100/learning-activity', hash:'#/100#%2F100', origin:'https://lms.example.test'};
    const document = {
        documentElement: root, body: root,
        querySelector: s => root.querySelector(s), querySelectorAll: s => root.querySelectorAll(s),
        createElement: tag => new Element(tag), createTextNode: text => new Element('#text', '', text),
        getElementById: id => { const find = n => n.id === id ? n : n.children.map(find).find(Boolean); return find(root); }
    };
    let tick;
    const context = {
        location, document, AbortController, URL,
        console: {error: (...args) => errors.push(args)},
        fetch: async (url, options) => {
            requests.push({url, options});
            if (fetcher) return fetcher(url, options);
            return {ok:true, json:async()=>url.endsWith('/url') ? {url:'https://files.example.test/chapter.pdf'} :
                {references:[{id:101, name:'示例资料(1).pdf'}, {id:102, name:'示例资料.pdf'}]}};
        },
        setInterval: f => { tick = f; }, setTimeout, clearTimeout,
        MutationObserver: class { constructor(f) { events.mutation = f; } observe() {} },
        addEventListener: (name, fn) => { events[name] = fn; },
        open: () => { const tab = {closed:false, location:{replace:url=>tab.url=url}, close(){this.closed=true;}}; opened.push(tab); return tab; }
    };
    context.window = context;
    vm.runInNewContext(source, context);
    return {root,list,document,location,requests,opened,events,errors,tick:()=>tick()};
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('页面已加载、附件异步到达：完整文件名匹配，排除大小文字，不重复插入', async () => {
    const env = setup({late:true});
    await settle();
    assert.equal(env.requests[0].url, '/api/activities/100/upload_references');
    env.root.appendChild(env.list);
    env.list.appendChild(row('示例资料(1).pdf'));
    env.list.appendChild(row('示例资料.pdf', false));
    env.list.appendChild(row('未知.pdf'));
    env.tick(); env.tick();
    const buttons = env.document.querySelectorAll(buttonSelector);
    assert.equal(buttons.length, 2);
    assert.deepEqual(buttons.map(b=>b.dataset.resourceId), ['101','102']);
    assert.equal(env.requests.length, 1);
    let prevented = 0;
    buttons[0].onclick({preventDefault(){prevented++;},stopPropagation(){prevented++;}});
    assert.equal(env.opened.length, 0, '等待接口时不预开空白标签');
    assert.equal(buttons[0].disabled, true);
    await settle();
    assert.equal(prevented, 2, '下载点击不能触发课件预览');
    assert.equal(env.requests[1].url, '/api/uploads/reference/document/101/url');
    assert.equal(env.opened.length, 0, '启动下载也不打开标签');
    const frame = env.document.querySelector('iframe');
    assert.equal(frame.src, 'https://files.example.test/chapter.pdf');
    assert.equal(frame.hidden, true);
    assert.equal(env.document.querySelector('a.tronclass-resource-file-link').href, frame.src);
    assert.equal(buttons[0].disabled, false);
});

test('切换活动时取消旧请求；迟到的响应不污染新课件，离开页面清理按钮', async () => {
    const resolvers = [];
    const env = setup({fetcher:(url, options)=>new Promise(resolve=>resolvers.push({resolve,options}))});
    env.list.appendChild(row('示例资料.pdf'));
    env.location.hash = '#/200'; env.events.hashchange();
    assert.equal(resolvers[0].options.signal.aborted, true);
    resolvers[1].resolve({ok:true,json:async()=>({references:[{id:200, name:'示例资料.pdf'}]})});
    await settle();
    resolvers[0].resolve({ok:true,json:async()=>({references:[{id:999, name:'示例资料.pdf'}]})});
    await settle();
    assert.equal(env.document.querySelector(buttonSelector).dataset.resourceId, '200');
    env.location.pathname='/course/100/content'; env.tick();
    assert.equal(env.document.querySelectorAll(buttonSelector).length, 0);
});

test('接口拒绝时显示可重试错误，扫描不会反复请求', async () => {
    const env = setup({fetcher:async()=>({ok:false,status:403})});
    await settle(); env.tick(); env.tick();
    assert.equal(env.requests.length, 1);
    assert.ok(env.document.getElementById('tronclass-download-notice'));
    assert.equal(env.document.querySelectorAll(buttonSelector).length, 0);
    assert.equal(env.errors.length, 1);
});

test('拒绝不安全下载地址，不创建标签或下载框架', async () => {
    const env = setup({fetcher:async url=>({ok:true,json:async()=>url.endsWith('/url') ? {url:'javascript:alert(1)'} :
        {references:[{id:101,name:'示例资料(1).pdf'}]}})});
    env.list.appendChild(row('示例资料(1).pdf'));
    await settle();
    env.document.querySelector(buttonSelector).onclick({preventDefault(){},stopPropagation(){}});
    await settle();
    assert.equal(env.opened.length, 0);
    assert.equal(env.document.querySelectorAll('iframe').length, 0);
    assert.ok(env.document.getElementById('tronclass-download-notice'));
});

test('重复下载各用独立框架，保留进行中的下载，备用链接不累积', async () => {
    const env = setup();
    env.list.appendChild(row('示例资料(1).pdf'));
    await settle();
    const button = env.document.querySelector(buttonSelector);
    const click = {preventDefault(){},stopPropagation(){}};
    button.onclick(click);
    await settle();
    const first = env.document.querySelector('iframe');
    button.onclick(click);
    await settle();
    assert.equal(env.opened.length, 0);
    assert.equal(env.document.querySelectorAll('iframe').length, 2);
    assert.equal(env.document.querySelectorAll('iframe')[0], first);
    assert.equal(env.document.querySelectorAll('a.tronclass-resource-file-link').length, 1);
    assert.equal(button.disabled, false);
});

test('下载地址请求失败或中途切换课件，不启动下载', async () => {
    let resolveDownload;
    const env = setup({fetcher:async url => {
        if (url.endsWith('/url')) return new Promise(resolve => { resolveDownload = resolve; });
        return {ok:true,json:async()=>({references:[{id:101,name:'示例资料(1).pdf'}]})};
    }});
    env.list.appendChild(row('示例资料(1).pdf'));
    await settle();
    const button = env.document.querySelector(buttonSelector);
    const click = {preventDefault(){},stopPropagation(){}};
    button.onclick(click);
    resolveDownload({ok:false,status:500});
    await settle();
    assert.equal(env.document.querySelectorAll('iframe').length, 0);
    assert.ok(env.document.getElementById('tronclass-download-notice'));
    assert.equal(button.disabled, false);
    button.onclick(click);
    env.location.hash = '#/200';
    resolveDownload({ok:true,json:async()=>({url:'https://files.example.test/old.pdf'})});
    await settle();
    assert.equal(env.document.querySelectorAll('iframe').length, 0);
    assert.equal(env.opened.length, 0);
    assert.equal(button.disabled, false);
});
