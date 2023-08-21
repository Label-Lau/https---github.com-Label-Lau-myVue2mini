import Dep from './dep.js'
import {def, hasOwn, isArray} from './utils'

// 在数组原型上增加一点改动
const arrayProto = Array.prototype
const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
    'push',
    'pop',
    'shift',
    'unshift',
    'splice',
    'sort',
    'reverse'
]

methodsToPatch.forEach(function (method) {
    // 缓存原型自身的方法
    const original = arrayProto[method]
    def(arrayMethods, method, function mutator(...args) {
        // 先执行原型自身的方法
        const result = original.apply(this, args)
        const ob = this.__ob__
        let inserted
        switch (method) {
            case 'push':
            case 'unshift':
                inserted = args
                break
            case 'splice':
                inserted = args.slice(2)
                break
        }
        if (inserted) {
            ob.observeArray(inserted)
        }
        // 触发依赖更新
        ob.dep.notify()
        return result
    })
})

// 观察对象的入口
export default function observe(value) {
    if (!value || typeof value !== 'object') {
        return
    }

    let ob

    // 如果自己本身就是已劫持对象，直接返回自己
    if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
        ob = value.__ob__
    } else if (!value._isMiniVue) {
        ob = new Observer(value)
    }

    return ob
}

// 对数据进行监听
// observer就是对整个data对象进行监听
function Observer(value) {
    this.value = value

    // observer的dep是dep
    this.dep = new Dep()

    // 对整个data对象，新增__ob__属性的监听
    def(value, '__ob__', this)
    
    // 如果我们的data是数组
    if (isArray(value)) {
        value.__proto__ = arrayMethods
        this.observeArray(value)
    } else {
        this.walk(value)
    }
}


Observer.prototype = {
    walk(obj) {
        const keys = Object.keys(obj) 
        for (let i = 0, len = keys.length; i < len; i++) {
            // 对data的每个属性进行依赖收集
            defineReactive(obj, keys[i], obj[keys[i]])
        }
    },

    observeArray(arry) {
        arry.forEach(item => {
            observe(item)
        })
    }
}

// data中的每一个属性，对应一个dep实例
export function defineReactive(obj, key, val) {
    const dep = new Dep()
    // 递归监听
    let childOb = observe(val)
    
    Object.defineProperty(obj, key, {
        enumerable: true,
        configurable: true,
        get() {      
            // 收集对应的观察者对象
            // Dep构造函数没用targe不会去进行依赖收集
            // 结论： 必须在watcher中进行get才会收集依赖
            if (Dep.target) {
                dep.depend()


                
                if (childOb) {
                    childOb.dep.depend()
                }

                if (isArray(val)) {
                    for (let e, i = 0, l = val.length; i < l; i++) {
                        e = val[i]
                        e && e.__ob__ && e.__ob__.dep.depend()
                    }
                }
            }
            return val
        },
        set(newVal) {
            if (val === newVal) {
                return
            }
            
            val = newVal
            // 递归监听
            childOb = observe(newVal)
            // 触发更新
            dep.notify()
            
        }
    })
}
