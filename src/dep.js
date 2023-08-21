// dep实例的ID
let uid = 0
// Dep.target为watcher实例
Dep.target = null

// 发布者，作用是收集watcher
export default function Dep() {
    this.id = uid++

    // subs里面装watcher实例
    this.subs = []  
}

Dep.prototype = {
    depend() {
        // 指watch
        // this指Dep实例本身
        if (Dep.target) {
            Dep.target.addDep(this)
        }
    },

    addSub(sub) {
        this.subs.push(sub)
    },

    removeSub(sub) {
        const index = this.subs.indexOf(sub)
        if (index > -1) {
            this.subs.splice(index, 1)
        }
    },

    notify() {
        this.subs.forEach(watcher => {
            watcher.update()
        })
    }
}