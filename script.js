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
        s_x: 25000,
        s_y: -10000,
        s_z: 0,
        tau_xy: 0,
        tau_yz: 7000,
        tau_zx: 0,
        st: '',
        fatigue_stress_input: 'von Mises',
        fatigue_data_cycles_raw: '1e4, 1e5, 1e6, 1e7',
        fatigue_data_stress_raw: '50e3, 40e3, 32e3, 20e3',
        datacollection: null,
        cycles: 0,
        two: null,
        mohr_w: 600,
        mohr_h: 300,
        fig_span: 0.75,
        left_end_condition: 'do_not_adjust',
        right_end_condition: 'do_not_adjust',
        fatigue_input_warning1: '',
        fatigue_input_warning2: '',
    },
    methods: {
        update_S_mj: function(){            // Update MathJax
            this.st = '\\[ S = \\begin{bmatrix}'+ this.s_x + '&' + this.tau_xy + '&' + this.tau_zx + '\\\\' + this.tau_xy + '&' + this.s_y + '&' + this.tau_yz + '\\\\' + this.tau_zx + '&' + this.tau_yz + '&' + this.s_z + '\\end{bmatrix} \\]';
            this.$nextTick(function () {
                MathJax.Hub.Typeset()
            });
        },
        update_fatigue_plot(){              // Update the fatigue plot
            this.plot_update_req = false;
            this.calculate_cycles();

            let loop_count = Math.min(this.fatigue_data_cycles.length,this.fatigue_data_stress.length);
            let da = [];
            let i=0;
            for(i; i<loop_count; i++){
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
            // Stress exists to right of data
            if (this.S_fatigue_input < this.fatigue_data_stress.reduce((a,c) => Math.min(a,c)) ){
                if(this.right_end_condition == 'as_Se'){
                    this.cycles = 'Infinity (stress is below endurance limit)';
                }
                else if (this.right_end_condition == 'extrapolate'){
                    let pn = {x:this.fatigue_data_cycles[this.fatigue_data_cycles.length-1], y:this.fatigue_data_stress[this.fatigue_data_stress.length-1]},
                        pn_1 = {x:this.fatigue_data_cycles[this.fatigue_data_cycles.length-2], y:this.fatigue_data_stress[this.fatigue_data_stress.length-2]},
                        m = (pn.y-pn_1.y)/(Math.log10(pn.x / pn_1.x)),
                        b = pn_1.y - m*Math.log10(pn_1.x),
                        result = parseInt(10**((this.S_fatigue_input-b)/m));
                    if (isNaN(result)){
                        this.cycles = 'N/A (overflow)';
                    }
                    else {
                        this.cycles = result;
                    }
                }
                else {
                    this.cycles = 'Stress value is below lowest defined fatigue stress data point. (You can enable an extrapolation option above.)';
                }
            }
            
            // Stress exists to left of data
            else if (this.S_fatigue_input > this.fatigue_data_stress.reduce((a,c) => Math.max(a,c)) ){
                if (this.left_end_condition == 'extrapolate') {
                    let pn = {x:this.fatigue_data_cycles[0], y:this.fatigue_data_stress[0]},
                        pn_1 = {x:this.fatigue_data_cycles[1], y:this.fatigue_data_stress[1]},
                        m = (pn.y-pn_1.y)/(Math.log10(pn.x / pn_1.x)),
                        b = pn_1.y - m*Math.log10(pn_1.x),
                        result = parseInt(10**((this.S_fatigue_input-b)/m));
                    if (isNaN(result)){
                        this.cycles = 'N/A';
                    }
                    else {
                        this.cycles = result;
                    }
                }
                else {
                    this.cycles = 'Stress value is above highest defined fatigue stress data point. (You can enable an extrapolation option above.)';
                }
            }
            else {
                let fn = new interp1d( _.reverse( _.clone(this.fatigue_data_stress) ), _.reverse( _.clone(this.fatigue_data_cycles.map(x => Math.log10(x)) ) ) );
                let exponent = fn.linterp(this.S_fatigue_input);
                if (isNaN(exponent)){
                    this.cycles = 'Interpoland outside data range.'
                }
                else{
                    this.cycles = parseInt(10**exponent);
                }
            }
        },
        draw_mohr_circle_plot(){
            this.two.clear()
            
            // set the scale
            let scale = Math.min( this.fig_span*this.mohr_w/(this.P1 - this.P3),
                                  this.fig_span*this.mohr_h/(this.P1 - this.P3) );

            // determine the center point
            let x = 0.5*(this.mohr_w - scale*(this.P1 + this.P3)),
                y = this.mohr_h/2;
            
            // draw circles
            let p1circ = this.two.makeCircle(x + scale*0.5*(this.P1+this.P3),y,scale*0.5*(this.P1-this.P3));
            p1circ.fill = '#b7f5d1';
            p1circ.stroke = '#1a4f30';
            p1circ.linewidth = 2;
            
            let p2circ = this.two.makeCircle(x + scale*0.5*(this.P1+this.P2),y,scale*0.5*(this.P1-this.P2));
            p2circ.fill = '#FFF';
            p2circ.stroke = '#d94925';
            p2circ.linewidth = 2;
            
            let p3circ = this.two.makeCircle(x + scale*0.5*(this.P2+this.P3),y,scale*0.5*(this.P2-this.P3));
            p3circ.fill = '#FFF';
            p3circ.stroke = '#2569d9';
            p3circ.linewidth = 2;
            
            // draw axes
            let x_tip = [this.mohr_w-60, y],
                y_tip = [x, 20],
                x_axis = this.two.makeLine(10, y, x_tip[0],x_tip[1] ),
                x_axis_arrow1 = this.two.makeLine(x_tip[0],x_tip[1],x_tip[0]-7,x_tip[1]-4 ),
                x_axis_arrow2 = this.two.makeLine(x_tip[0],x_tip[1],x_tip[0]-7,x_tip[1]+4 ),
                y_axis = this.two.makeLine(x, this.mohr_h-10, y_tip[0], y_tip[1] ),
                y_axis_arrow1 = this.two.makeLine(y_tip[0], y_tip[1], y_tip[0]-4, y_tip[1]+7 ),
                y_axis_arrow2 = this.two.makeLine(y_tip[0], y_tip[1], y_tip[0]+4, y_tip[1]+7 );

            x_axis.stroke = 'grey';
            x_axis_arrow1.stroke = 'grey';
            x_axis_arrow2.stroke = 'grey';
            y_axis.stroke = 'grey';
            y_axis_arrow1.stroke = 'grey';
            y_axis_arrow2.stroke = 'grey';

            let sigma = new Two.Text('Normal',this.mohr_w-30,y),
                tau = new Two.Text('Shear',x,10);
            this.two.add(sigma);
            this.two.add(tau);            

            // add labels
            let p1t = new Two.Text('P1', scale*this.P1 + x + 15, y - 10);
            this.two.add(p1t);
            if(this.P2 != 0){
                let p2t = new Two.Text('P2', scale*this.P2 + x + 15, y - 10);
                this.two.add(p2t);
            }
            if(this.P3 != 0){
                let p3t = new Two.Text('P3', scale*this.P3 + x - 15, y - 10);
                this.two.add(p3t);
            }
            if(this.tau_1 != 0){
                let tau_1_t = new Two.Text('Tau_1', scale*0.5*(this.P1 + this.P3) + x, y - scale*0.5*(this.P1 - this.P3) - 10);
                this.two.add(tau_1_t);
            }
            if(this.tau_2 != 0){
                let tau_2_t = new Two.Text('Tau_2', scale*0.5*(this.P1 + this.P2) + x, y - scale*0.5*(this.P1 - this.P2) - 10);
                this.two.add(tau_2_t);
            }
            if(this.tau_3 != 0){
                let tau_3_t = new Two.Text('Tau_3', scale*0.5*(this.P2 + this.P3) + x, y - scale*0.5*(this.P2 - this.P3) - 10);
                this.two.add(tau_3_t);
            }

            this.two.update()
        }
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

        // Principal direction vectors  -- these don't seem to be coming out correctly ...
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

        // Principal shearing stresses
        tau_1(){ return 0.5*(this.P1 - this.P3)},
        tau_2(){ return 0.5*(this.P1 - this.P2)},
        tau_3(){ return 0.5*(this.P2 - this.P3)},

        // Derived stresses
        Svm(){    // von Mises
            return Math.sqrt(((this.P1-this.P2)**2+(this.P2-this.P3)**2+(this.P3-this.P1)**2+6*(this.tau_xy**2+this.tau_yz**2+this.tau_zx**2))/2);
        },
        Sms(){    // Max shear
            return this.tau_2;
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
        fatigue_data_stress() {
            let stresses = [];
            this.fatigue_data_stress_raw.split(',').forEach(function (element) {
                stresses.push(parseFloat(element));
            });
            let is_decreasing;
            // check that stresss are decreasing
            for (let i = 0; i < stresses.length-1; i++) {
                if (stresses[i+1] < stresses[i]){ is_decreasing = true; }
                else {
                    is_decreasing = false;
                    break;
                }
            }
            if (!is_decreasing){
                this.fatigue_input_warning1 = 'Stresses must be in decreasing order.';
            } else {
                this.fatigue_input_warning1 = '';
            }
            return stresses;
        },
        fatigue_data_cycles() {
            let cycles = [];
            this.fatigue_data_cycles_raw.split(',').forEach(function (element) {
                cycles.push(parseFloat(element));
            });
            // check that cycles are increasing
            let is_increasing;
            for (let i = 0; i < cycles.length-1; i++) {
                if (cycles[i+1] > cycles[i]){ is_increasing = true; }
                else {
                    is_increasing = false;
                    break;
                }
            }
            if (!is_increasing){
                this.fatigue_input_warning2 = 'Cycles must be in increasing order.';
            } else {
                this.fatigue_input_warning2 = '';
            }
            return cycles;
        }
    },
    mounted(){
        // Draw Mohr plot
        let plot_elem = document.getElementById('mohr_circle_plot');
        plot_elem.setAttribute('width',this.mohr_w);
        plot_elem.setAttribute('height',this.mohr_h);
        this.two = new Two({ width: this.mohr_w, height: this.mohr_h }).appendTo(plot_elem);
        this.draw_mohr_circle_plot();

        // Draw fatigue plot
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
        },
        left_end_condition(){
            this.calculate_cycles();
            this.update_fatigue_plot();
        },
        right_end_condition(){
            this.calculate_cycles();
            this.update_fatigue_plot();
        },
        s_x() { this.draw_mohr_circle_plot() },
        s_y() { this.draw_mohr_circle_plot() },
        s_z() { this.draw_mohr_circle_plot() },
        tau_xy() { this.draw_mohr_circle_plot() },
        tau_yz() { this.draw_mohr_circle_plot() },
        tau_zx() { this.draw_mohr_circle_plot() },
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
        let start = this.xs.indexOf(_.findLast(this.xs,function(e){ return e <= x }));
        if (start == this.xs.length-1){
            return interp(this.xs[start-1], this.xs[start], this.ys[start-1], this.ys[start], x);
        }
        else {
            return interp(this.xs[start], this.xs[start+1], this.ys[start], this.ys[start+1], x);
        }
    }
}