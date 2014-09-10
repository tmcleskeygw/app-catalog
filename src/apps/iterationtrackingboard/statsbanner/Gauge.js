(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * gauge chart for stats banner
     * abstract class
     */
    Ext.define('Rally.apps.iterationtrackingboard.statsbanner.Gauge', {
        extend: 'Rally.apps.iterationtrackingboard.statsbanner.BannerWidget',
        alias:'widget.statsbannergauge',

        requires: [
            'Rally.ui.chart.Chart',
            'Rally.util.Timebox',
            'Rally.util.Colors'
        ],

        config: {
            context: null,
            store: null
        },

        onDataChanged: Ext.emptyFn,
        getChartEl: Ext.emptyFn,
        _getChartConfig: Ext.emptyFn,

        _tzOffsetPromises: {},

        initComponent: function() {
            this.mon(this.store, 'datachanged', this.onDataChanged, this);
            this.callParent(arguments);
        },

        expand: function() {
            this.callParent();
            if (this.chart) {
                this.chart.doLayout();
            } else {
                this._addChart(this._getChartConfig({}));
            }
        },

        onRender: function() {
            this.callParent(arguments);
            if (!this.getContext().getTimeboxScope().getRecord()) {
                this._addEmptyChart();
            }
        },

        _addEmptyChart: function() {
            this._cleanupChart();
            this._addChart({
                chartData: {
                    series: [{
                        data: [
                            {
                                name: '',
                                y: 100,
                                color: Rally.util.Colors.grey1
                            }
                        ]
                    }]
                }
            });
        },

        _cleanupChart: function () {
            if (this.chart) {
                this.chart.destroy();
                delete this.chart;
            }
        },

        onDestroy: function () {
            this._cleanupChart();
            this.callParent(arguments);
        },

        onResize: function() {
            if (this.chart && !this.getEl().up('.stats-banner.collapsed')) {
                this.chart.updateLayout();
            }
            this.callParent(arguments);
        },

        refreshChart: function(chartConfig) {
            Ext.suspendLayouts();
            this._cleanupChart();
            if (this.rendered && this.expanded) {
                this._addChart(chartConfig);
            }
            Ext.resumeLayouts();
            this.fireEvent('ready', this);
        },

        _addChart: function(chartConfig) {
            var height = 62;
            this.chart = Ext.create('Rally.ui.chart.Chart', Ext.apply({
                loadMask: false,
                cls: 'gauge',
                chartConfig: {
                    chart: {
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        defaultSeriesType: 'pie',
                        height: height,
                        spacingTop: 0,
                        spacingRight: 0,
                        spacingBottom: 0,
                        spacingLeft: 0
                    },
                    plotOptions: {
                        pie: {
                            borderWidth: 0,
                            center: ['50%', '50%'],
                            dataLabels: {
                                enabled: false
                            },
                            size: height - 4,
                            innerSize: height - 14,
                            enableMouseTracking: false, //turns off chart hover, but for tooltips you'll need this on
                            shadow: false
                        }
                    },
                    title: '',
                    tooltip: {
                        enabled: false
                    }
                }
            }, chartConfig));
            this.cmp.add(chart);
        },

        getTimeboxData: function() {
            return this._getTZOffset().then({
                success: function (tzOffset) {
                    var timebox = this.getContext().getTimeboxScope().getRecord();
                    if(timebox) {
                        return Rally.util.Timebox.getCounts(
                            timebox.get('StartDate'),
                            timebox.get('EndDate'),
                            this.getContext().getWorkspace().WorkspaceConfiguration.WorkDays,
                            tzOffset);
                    } else {
                        return {
                            remaining: 0,
                            workdays: 0
                        };
                    }
                },
                scope: this
            });
        },

        _getTZOffset: function() {
            var projectRef = Rally.util.Ref.getRelativeUri(this.getContext().getProject());
            if (!Ext.isDefined(this._tzOffsetPromises[projectRef])) {
                var deferred = this._tzOffsetPromises[projectRef] = Ext.create('Deft.Deferred');
                Rally.environment.getIoProvider().httpGet({
                    url: Rally.environment.getServer().getWsapiUrl() + '/iteration',
                    params: {
                        includeSchema: true,
                        pagesize:1,
                        fetch: false,
                        project: projectRef
                    },
                    success: function(results) {
                        deferred.resolve((results.Schema.properties.EndDate.format.tzOffset || 0) / 60);
                    },
                    requester: this,
                    scope: this
                });
            }
            return this._tzOffsetPromises[projectRef];
        },

        getAcceptanceData: function () {
            return this._getScheduleStates().then({
                success: function (scheduleStates) {
                    var acceptanceData = {
                        accepted: 0,
                        total: 0
                    };
                    var accepted = _.indexOf(scheduleStates, 'Accepted');
                    _.each(this.store.getRange(), function (record) {
                        var estimate = record.get('PlanEstimate') || 0;
                        if (_.indexOf(scheduleStates, record.get('ScheduleState')) >= accepted) {
                            acceptanceData.accepted += estimate;
                        }
                        acceptanceData.total += estimate;
                    }, this);
                    return acceptanceData;
                },
                scope: this,
                requester: this
            });
        },

        _getScheduleStates: function () {
            if (this._scheduleStates) {
                return Deft.Promise.when(this._scheduleStates);
            } else {
                return this.store.model.getField('ScheduleState').getAllowedValueStore().load().then({
                    success: function (records) {
                        this._scheduleStates = _.map(records, function (record) {
                            return record.get('StringValue');
                        });
                        return this._scheduleStates;
                    },
                    scope: this,
                    requester: this
                });
            }
        }
    });
})();