import Directive from './directive.js'
import {toArray, replace, getAttr, getBindAttr} from './utils'
import {defineReactive} from './observer.js'

// 指令描述符容器
const des = []
console.log('des', des)
// 用来判断当前是否在解析指令
let pending = false

export function compile(vm, el) {
    // 如果当前节点不是v-for指令 则继续解析子节点

    // 核心：找到动态节点，或者内置指令 添加到des数组中
    if (!compileNode(el, vm)) {
        if (el.hasChildNodes()) {
            compileNodeList(el.childNodes, vm)
        }
    }
    
    // 当前在解析指令 如果有新的指令 则加到des数组后面 数组会按顺序执行描述符 包括新的描述符
    // 假如有5个描述符 当前执行到第2个 如果有新的 则push进数组 

    debugger

    if (!pending) {
        let dir, descriptor
        pending = true
        sortDescriptors(des)
        while (des.length) {       
            descriptor = des.shift()
            dir = new Directive(descriptor, descriptor.vm)  

            dir._bind()          
            descriptor.vm._directives.push(dir)  
        }
        pending = false
        vm._callHook('compiled')
        // JS主线程执行完再进行废弃指令回收
        setTimeout(() => {
            teardown(vm)
            vm._callHook('destroyed')
        }, 0)
    }
}

// 1. 判断是否是for循环的节点
// 2. 对元素的指令进行处理
function compileNode(node, vm) {
    const type = node.nodeType
    // 自定义组件 和 浏览器元素dom都是1
    if (type == 1) {
        return compileElement(node, vm)
    } else if (type == 3) {
        // 处理文本
        return compileTextNode(node, vm)
    }
}


function compileNodeList(nodes, vm) {
    nodes.forEach(node => {
        // 处理当前节点，如果是for循环就不继续处理。如果不是，而且有子节点，就继续处理子节点
        if (!compileNode(node, vm)) {           
            if (node.hasChildNodes()) {              
                compileNodeList(node.childNodes, vm)
            }
        }
    })
}

const onRe = /^(v-on:|@)/
const dirAttrRE = /^v-([^:]+)(?:$|:(.*)$)/
const bindRe = /^(v-bind:|:)/
const tagRE = /\{\{\{((?:.|\n)+?)\}\}\}|\{\{((?:.|\n)+?)\}\}/g
const commonTagRE = /^(div|p|span|img|a|b|i|br|ul|ol|li|h1|h2|h3|h4|h5|h6|code|pre|table|th|td|tr|form|label|input|select|option|nav|article|section|header|footer|button|textarea)$/i
const reservedTagRE = /^(slot|partial|component)$/i

function compileElement(node, vm) {   
    const directives = vm.$options.directives
    const tag = node.tagName.toLowerCase() 

    // 如果不是常规标签，代表是组件
    if (!commonTagRE.test(tag) && !reservedTagRE.test(tag)) {    
        if (vm.$options.components[tag]) {
            des.push({
                vm,
                el: node,
                name: 'component',
                expression: tag,
                def: directives.component,
                modifiers: {
                    literal: true
                }
            })
        } 
    } else if (tag === 'slot') {
        des.push({
            vm,
            el: node,
            arg: undefined,
            name: 'slot',
            attr: undefined,
            expression: '',
            def: directives.slot
        })
    } else if (node.hasAttributes()) {       
        let matched
        let isFor = false
        const attrs = toArray(node.attributes)
        attrs.forEach((attr) => {       
            const name = attr.name.trim()
            const value = attr.value.trim()

            // 如果是事件
            if (onRe.test(name)) {
                node.removeAttribute(name)
                des.push({
                    vm,
                    el: node,
                    arg: name.replace(onRe, ''),
                    name: 'on',
                    attr: name,
                    expression: value,
                    def: directives.on
                })
            } else if (bindRe.test(name)) {
                node.removeAttribute(name)
                // 针对过滤器
                const values = value.split('|')
                const temp = {
                    vm,
                    el: node,
                    arg: name.replace(bindRe, ''),
                    name: 'bind',
                    attr: name,
                    def: directives.bind
                }

                if (values.length > 1) {
                    const expression = values.shift()
                    const filters = []
                    values.forEach(value => {
                        filters.push({
                            name: value.trim()
                        })
                    })

                    temp.expression = expression
                    temp.filters = filters
                } else {
                    temp.expression = value
                }

                des.push(temp)
            } else if (matched = name.match(dirAttrRE)) {             
                if (name == 'v-text') {
                    node.removeAttribute(name)
                    const values = value.split('|')
                    const temp = {
                        vm,
                        el: node,
                        arg: name.replace(bindRe, ''),
                        name: 'text',
                        attr: name,
                        def: directives.text
                    }

                    if (values.length > 1) {
                        const expression = values.shift()
                        const filters = []
                        values.forEach(value => {
                            filters.push({
                                name: value.trim()
                            })
                        })

                        temp.expression = expression
                        temp.filters = filters
                    } else {
                        temp.expression = value
                    }

                    des.push(temp)
                } else if (name !== 'v-else') {
                    node.removeAttribute(name)
                    
                    des.push({
                        vm,
                        el: node,
                        arg: undefined,
                        name: name.replace(/^v-/, ''),
                        attr: name,
                        expression: value,
                        def: directives[matched[1]]
                    })
                }

                if (name == 'v-for') {
                    isFor = true
                }
            }
        })
        return isFor
    }
}

function compileTextNode(node, vm) {
    // 生成一个对象结构，对动态属性打上tag标记
    const tokens = parseText(node.nodeValue, vm)
    if (!tokens) {
        return
    }

    // 创建一个空节点
    const frag = document.createDocumentFragment()
    let el
    tokens.forEach(token => {
        el = token.tag ? processTextToken(token, vm) : document.createTextNode(token.value)
        frag.appendChild(el)

        // 如果遇到 {{}} 就会打上tag，并将修改文本的update，只修改这个文本的dom推入des
        if (token.tag) {
            des.push(token.descriptor)
        } 
    })

    // 异步替换节点是为了防止在compileNodeList中循环处理节点时 突然删掉其中一个节点而造成处理错误
    Promise.resolve().then(() => {
        replace(node, frag)
    }) 
}
// 将文档节点解释为TOKEN
function parseText(text, vm) {
    let index = 0
    let lastIndex = 0
    let match
    const tokens = []

    while (match = tagRE.exec(text)) {
        index = match.index

        if (index > lastIndex) {
            tokens.push({
                value: text.slice(lastIndex, index),
            })
        }

        tokens.push({
            value: match[2],
            tag: true
        })
        lastIndex = index + match[0].length
    }

    if (lastIndex < text.length) {
        tokens.push({
            value: text.slice(lastIndex)
        })
    }
    return tokens
}

function processTextToken(token, vm) {
    const directives = vm.$options.directives
    const el = document.createTextNode(' ')
    if (token.descriptor) {
        return
    }
    // 针对过滤器
    const values = token.value.split('|')


    // 1. 包含文本节点的位置
    // 2. 包含修改函数

    token.descriptor = {
        vm,
        el,
        name: 'text',
        def: directives.text,
    }

    if (values.length > 1) {
        const value = values.shift()
        const filters = []
        
        values.forEach(value => {
            filters.push({
                name: value.trim()
            })
        })

        token.descriptor.expression = value.trim()
        token.descriptor.filters = filters
    } else {
        token.descriptor.expression = token.value.trim()
    }

    return el
}

// 整理指令优先级 优先高的先执行 例如v-for
function sortDescriptors(des) {
    des.forEach(d => {
        if (!d.def.priority) {
            d.def.priority = 1000
        }
    })
    des.sort((a, b) => {
        return b.def.priority - a.def.priority
    })
}

// 删除已经用不上的指令 如果不是v-if、v-for 并且不在文档中的DOM元素删除并和相应绑定的指令、观察者函数删除
function teardown(vm) {
    const body = document.body
    const contains = body.contains
    const dirs = vm._directives
    let attr
    const temp = []
    let dir
    // document.body.contains判断DOM是否在文档中
    while (dirs.length) {
        dir = dirs.shift()
        attr = dir.descriptor.attr
        // 如果DOM不在文档中 并且指令不是v-for v-if则删除指令
        if (!contains.call(body, dir.el) && attr !== 'v-for' && attr !== 'v-if') {
            dir._teardown()
        } else {
            temp.push(dir)
        }
    }
    
    vm._directives = [...temp]
    temp.length = 0
}


export function compileProps(vm, el, propsOptions) {
    const directives = vm.$options.directives
    const props = []
    let prop, value, name
    const keys = Object.keys(propsOptions)
    keys.forEach(key => {
        name = propsOptions[key]
        prop = {
            name,
            path: name
        }
        if ((value = getBindAttr(el, name)) !== null) {
            // 动态绑定
            prop.dynamic = true
            prop.raw = prop.parentPath = value
        } else if ((value = getAttr(el, name)) !== null) {
            // 静态绑定
            prop.raw = value
        }
        props.push(prop)
    })

    vm._props = {}

    props.forEach(prop => {
        let {path, raw, options} = prop
        vm._props[path] = prop
        // 动态绑定则建一个指令 否则直接渲染
        if (prop.dynamic) {
 
            
            // 如果props是动态属性，则把更新函数推入des队列中
            if (vm._context) {
                des.push({
                    vm,
                    name: 'prop',
                    def: directives.prop,
                    prop,
                })
            }
        } else {

            defineReactive(vm, prop.path, prop.raw)
        }
    })
}