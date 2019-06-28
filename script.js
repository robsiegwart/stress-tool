// Vue.config.devtools = true;

var chart = Vue.component('fatigue-plot', {
    extends: VueChartJs.Scatter,
    mixins: [VueChartJs.mixins.reactiveProp],
    data() {
        return {
            options: {
                responsive: true,
                height: 400,
                maintainAspectRatio: false,
                scales: {
                    yAxes: [{
                        ticks: {
                            beginAtZero: true,
                        },
                        scaleLabel: {
                            labelString: 'Stress',
                            display: true,
                        }
                    }],
                    xAxes: [{
                            type: 'logarithmic',
                            scaleLabel: {
                                labelString: 'Cycles',
                                display: true,
                            }
                    }]
                },
                legend: {
                    display: false
                }
            },
        }
    },
    mounted(){
        this.renderChart(this.chartData, this.options);
    }
});

var app = new Vue({
    el: '#app',
    data: {
        s_x: 24000,
        s_y: 12000,
        s_z: 0,
        tau_xy: 0,
        tau_yz: 7000,
        tau_zx: 0,
        st: '',
        fatigue_stress_input: 'von Mises',
        fatigue_data_cycles_raw: '1e3, 5e3, 1e5, 1e6',
        fatigue_data_stress_raw: '60e3, 30e3, 20e3, 10e3',
        fatigue_data_cycles: [],
        fatigue_data_stress: [],
        datacollection: null,
        cycles: 0,
    },
    methods: {
        update_S_mj: function(){  // Update MathJax
            this.st = '\\[ S = \\begin{bmatrix}'+ this.s_x + '&' + this.tau_xy + '&' + this.tau_zx + '\\\\' + this.tau_xy + '&' + this.s_y + '&' + this.tau_yz + '\\\\' + this.tau_zx + '&' + this.tau_yz + '&' + this.s_z + '\\end{bmatrix} \\]';
            this.$nextTick(function () {
                MathJax.Hub.Typeset()
            });
        },
        update_fatigue_plot(){    // Update the fatigue plot
            this.plot_update_req = false;
            // Convert stress data to array
            let stresses = [];
            this.fatigue_data_stress_raw.split(',').forEach(function (element) {
                stresses.push(parseFloat(element));
            });
            this.fatigue_data_stress = stresses;

            // Convert cycle data to array
            let cycles = [];
            this.fatigue_data_cycles_raw.split(',').forEach(function (element) {
                cycles.push(parseFloat(element));
            });
            this.fatigue_data_cycles = cycles;

            this.calculate_cycles();

            let loop_count = Math.min(this.fatigue_data_cycles.length,this.fatigue_data_stress.length);
            let da = [];
            let i=0;
            for(i;i<loop_count;i++){
                da.push({x: this.fatigue_data_cycles[i], y: this.fatigue_data_stress[i]})
            };
            this.datacollection = {
                datasets: [
                    {
                        data: da,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        showLine: true,
                        lineTension: 0,
                        pointBorderColor: 'blue',
                        pointBorderWidth: 2,
                        pointHoverBorderWidth: 2,
                        borderColor: 'blue',
                        fill: false,
                    },
                    {
                        data: [{x: this.cycles, y: this.S_fatigue_input }],
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBorderWidth: 3,
                        pointHoverBorderWidth: 3,
                        pointBorderColor: 'red',
                    }
                ]
            }
        },
        calculate_cycles(){
            if (this.S_fatigue_input < this.fatigue_data_stress.reduce((a,c) => Math.min(a,c)) ){
                this.cycles = 'Stress value below lowest fatigue stress data point.';
            }
            else {
                let fn = new interp1d( _.reverse( _.clone(this.fatigue_data_stress) ), _.reverse( _.clone(this.fatigue_data_cycles.map(x => Math.log10(x)) ) ) );
                let exponent = fn.linterp(this.S_fatigue_input);
                // console.log(exponent);
                if (isNaN(exponent)){
                    this.cycles = 'Interpoland outside data range.'
                }
                else{
                    this.cycles = 10**exponent;
                }
            }
        },
    },
    computed: {
        // Stress components
        s_xComputed: {
            get(){ return this.s_x; },
            set: _.debounce(function(val){ this.s_x = val; },500)
        },
        s_yComputed: {
            get(){ return this.s_y; },
            set: _.debounce(function(val){ this.s_y = val; },500)
        },
        s_zComputed: {
            get(){ return this.s_z; },
            set: _.debounce(function(val){ this.s_z = val; },500)
        },
        tau_xyComputed: {
            get(){ return this.tau_xy; },
            set: _.debounce(function(val){ this.tau_xy = val; },500)
        },
        tau_yzComputed: {
            get(){ return this.tau_yz; },
            set: _.debounce(function(val){ this.tau_yz = val; },500)
        },
        tau_zxComputed: {
            get(){ return this.tau_zx; },
            set: _.debounce(function(val){ this.tau_zx = val; },500)
        },

        // Eigenvalues/principal stresses
        eig(){
            let M = [[this.s_x,    this.tau_xy, this.tau_zx],
                     [this.tau_xy, this.s_y,    this.tau_yz],
                     [this.tau_zx, this.tau_yz, this.s_z]];
            this.update_S_mj();
            return numeric.eig(M);
        },
        e_vals(){ return this.eig.lambda.x; },
        e_vecs(){ return this.eig.E.x; },

        P1(){ return this.e_vals.sort(sortNumber)[2]; },
        P2(){ return this.e_vals.sort(sortNumber)[1]; },
        P3(){ return this.e_vals.sort(sortNumber)[0]; },

        // Principal direction vectors  -- they don't seem to be coming out correctly ...
        P1_vec(){
            let vec = this.e_vecs[this.e_vals.indexOf(this.P1)];
            return '[ ' + Number(vec[0]).toPrecision(3) + ', ' + Number(vec[1]).toPrecision(3) + ', ' + Number(vec[2]).toPrecision(3) + ' ]';
        },
        P2_vec(){
            let vec = this.e_vecs[this.e_vals.indexOf(this.P2)];
            return '[ ' + Number(vec[0]).toPrecision(3) + ', ' + Number(vec[1]).toPrecision(3) + ', ' + Number(vec[2]).toPrecision(3) + ' ]';
        },
        P3_vec(){
            let vec = this.e_vecs[this.e_vals.indexOf(this.P3)];
            return '[ ' + Number(vec[0]).toPrecision(3) + ', ' + Number(vec[1]).toPrecision(3) + ', ' + Number(vec[2]).toPrecision(3) + ' ]';
        },

        // Derived stresses
        Svm(){    // von Mises
            return Math.sqrt(((this.P1-this.P2)**2+(this.P2-this.P3)**2+(this.P3-this.P1)**2+6*(this.tau_xy**2+this.tau_yz**2+this.tau_zx**2))/2);
        },
        Sms(){    // Max shear
            return 0.5*(this.P1 - this.P3);
        },

        S_fatigue_input(){
            switch (this.fatigue_stress_input) {
                case 'von Mises':
                    return this.Svm;
                case 'First Principal':
                    return this.P1;
                case 'Sx':
                    return this.s_x;
                case 'Sy':
                    return this.s_y;
                case 'Sz':
                    return this.s_z;
            }
        },
    },
    mounted(){
        this.update_fatigue_plot();
    },
    watch: {
        fatigue_data_cycles_raw: _.debounce(function(){
            this.calculate_cycles();
            this.update_fatigue_plot()
        }, 500),
        fatigue_data_stress_raw: _.debounce(function(){
            this.calculate_cycles();
            this.update_fatigue_plot()
        }, 500),
        fatigue_stress_input(){
            this.calculate_cycles();
            this.update_fatigue_plot();
        },
        eig(){
            this.calculate_cycles();
            this.update_fatigue_plot();
        }
    }
})

function sortNumber(a,b){
    return a - b;
}

function interp(x1,x2,y1,y2,x){
    let m = (y2-y1)/(x2-x1),
        b = y1-m*x1;
    return m*x + b;
}

function interp1d(xs,ys){
    this.xs = xs;
    this.ys = ys;
    this.xmin = this.xs.reduce((a,c) => Math.min(a,c));
    this.xmax = this.xs.reduce((a,c) => Math.max(a,c));
    this.linterp = function(x){
        if ( (x > this.xmax) || (x < this.xmin) ){
            return null
        }
        else {
            let start = this.xs.indexOf(_.findLast(this.xs,function(e){ return e <= x }));
            if (start == this.xs.length-1){
                return interp(this.xs[start-1], this.xs[start], this.ys[start-1], this.ys[start], x);
            }
            else {
                return interp(this.xs[start], this.xs[start+1], this.ys[start], this.ys[start+1], x);
            }
        }
    }
}



// window.onbeforeunload = function () {
//     return 'Leave site? Changes may not be saved.'
// }

// window.__VUE_DEVTOOLS_GLOBAL_HOOK__.Vue = app.constructor;