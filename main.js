// Load the required libraries & scripts synchronously and wait for the promise
var getScriptPromisify = (src) => {
  return new Promise((resolve) => {
    $.getScript(src, resolve);
  });
};

// Process the Model Metadata
const parseMetadata = (metadata) => {
  const { dimensions: dimensionsMap, mainStructureMembers: measuresMap } =
    metadata;
  const dimensions = [];
  for (const key in dimensionsMap) {
    const dimension = dimensionsMap[key];
    dimensions.push({ key, ...dimension });
  }

  const measures = [];
  for (const key in measuresMap) {
    const measure = measuresMap[key];
    measures.push({ key, ...measure });
  }
  return { dimensions, measures, dimensionsMap, measuresMap };
};

(function () {
  const prepared = document.createElement("template");
  prepared.innerHTML = `
                        <style></style>
                        <div id="root" style="width: 100%; height: 100%;"></div>
                      `;
  class generateGanttChart extends HTMLElement {
    constructor() {
      super();
      this._shadowRoot = this.attachShadow({ mode: "open" });
      this._shadowRoot.appendChild(prepared.content.cloneNode(true));
      this._root = this._shadowRoot.getElementById("root");
      this._props = {};
      this.render();
    }

    onCustomWidgetResize(width, height) {
      this.render();
    }

    onCustomWidgetAfterUpdate(changedProps) {
      this.render();
    }

    set myDataSource(dataBinding) {
      this.dataBinding = dataBinding;
      this.render();
    }

    async render() {
      /*Constants*/
      var DIM_CATEGORY_INDEX = 0; //Index field used as an internal identifier
      var DIM_ORDER_NUMBER = 1; // Order Number
      var DIM_TIME_START = 2; // Planned Start Timestamp
      var DIM_TIME_END = 3; // Planned End Timestamp
      var DIM_WORKCENTER = 4; // WorkCenter
      var DIM_CURRENT_ACTIVITY_TIME = 5; // Time in Current Activity
      var DIM_TIME_PROGRESS = 6; // Absolute Progress Timestamp
      var DIM_BUFFER = 8; // Buffer Time
      var DIM_COLOR = 9; // Status Color
      var DIM_NOW_TIMESTAMP = 10; // Now Time Stamp used for the Markline
      var DIM_HOLIDAY_STRING = 11; // Holiday timestamp
      var DIM_ABSOLUTE_TIME = 12; // Absolute Time (same as DIM_TIME_PROGRESS but without _TIMESTAMP)
      var DIM_NOW_TIME = 13 ; // Now Time (same as DIM_NOW_TIMESTAMP but without _TIMESTAMP)
      var DIM_STATUS_CODE = 14; // Status code


      var CHECK_NUMBER_OF_DAYS_FOR_WEEKENDS = 30;
      var MAXIMUM_VALUE_SPAN = 15;
      var NUMBER_OF_SPLITS = 8;

      const dataBinding = this.dataBinding;
      if (!dataBinding || dataBinding.state !== "success") {
        return;
      }

      await getScriptPromisify(
        "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"
      );

      /*------------------------------ Process model data bound to the widget ----------------------------------*/
      const { data, metadata } = dataBinding;
      const { dimensions, measures } = parseMetadata(metadata);

      const aData = {};
      aData["dimensions"] = [];
      aData["data"] = [];

      const substringTIMESTAMP = "_TIMESTAMP"; // Converting datetime fields to UNIX timestammp which has a substring TIMESTAMP
      data.forEach((row, index) => {
        let rowData = [];
        rowData.push(index); // Added loop index as an identifier
        dimensions.forEach((dimension) => {
          if (dimension.id.indexOf(substringTIMESTAMP) === -1) {
            rowData.push(row[dimension.key].label);
          } else {
            var d = yyyymmddhhmmssToDate(row[dimension.key].id);
            var adjustedTime = getAdjustedTime(d);
            rowData.push(adjustedTime);
          }
        });
        measures.forEach((measure) => {
          rowData.push(row[measure.key].raw);
        });
        aData["data"].push(rowData);
      });

      aData["dimensions"].push("INDEX");
      dimensions.forEach((dimension) => {
        aData["dimensions"].push(dimension.id);
      });
      measures.forEach((measure) => {
        aData["dimensions"].push(measure.id);
      });
      /* Sort the result set in descending order. The graph is plotted from bottom to top, hence sorting the data in descending order
       to make it appear in ascending when it is rendered */
      aData.data.sort(function (a, b) {
        return (
          b[3].getTime() - a[3].getTime() || b[2].getTime() - a[2].getTime()
        );
      });

      var holidays = getUpcomingHolidays(aData.data[0][DIM_HOLIDAY_STRING]);
      var holidayMarkArea = getHolidayMarkArea(holidays);
     
      aData.data.forEach((row, index) => {
        row[DIM_CATEGORY_INDEX] = index;
        
        let holidaysCount = 0 ;
        let absoluteProgressTime = new Date(yyyymmddhhmmssToDate(row[DIM_ABSOLUTE_TIME]).setHours(0,0,0));
        let nowTime = new Date(yyyymmddhhmmssToDate(row[DIM_NOW_TIME]).setHours(0,0,0));
        let startTime = new Date(yyyymmddhhmmssToDate(row[DIM_TIME_START]).setHours(0,0,0));
        
        
        // Adjust Remainining Time
         if (row[DIM_STATUS_CODE] === 401) {
          holidaysCount = countNumberOfHolidaysBetween(
            holidays,
            row[DIM_TIME_START],
            row[DIM_TIME_END]
          );
         } else {
          holidaysCount = countNumberOfHolidaysBetween(
            holidays,
            absoluteProgressTime,
            row[DIM_TIME_END]
          );
         }
         row[DIM_CURRENT_ACTIVITY_TIME] = parseFloat(row[DIM_CURRENT_ACTIVITY_TIME]) - holidaysCount * 24 * 60;

        // Adjust Buffer Time
       if ( nowTime >= absoluteProgressTime) {
         holidaysCount = countNumberOfHolidaysBetween(
         holidays,
         absoluteProgressTime,
         nowTime);
       } else {
       holidaysCount = countNumberOfHolidaysBetween(
         holidays,
         nowTime,
         absoluteProgressTime
        );
       }
        if (row[DIM_COLOR] == 'RED'){
         row[DIM_BUFFER] = parseFloat(row[DIM_BUFFER]) + holidaysCount * 24 * 60;
        } else 
        { row[DIM_BUFFER] = parseFloat(row[DIM_BUFFER]) - holidaysCount * 24 * 60;}

        if (nowTime < startTime) {
         row[DIM_BUFFER] = 0;
        } else 
        { row[DIM_BUFFER] = row[DIM_BUFFER] }
      });

      /*-------------------------------------Chart related customizations---------------------------------------*/

      const myChart = echarts.init(this._root, "main");
      let option;

      var _rawData;
      _rawData = aData;
      myChart.setOption((option = generateOptions()));

      function generateOptions() {
        var markline = _rawData.data[0][DIM_NOW_TIMESTAMP]; // Now Timestamp Markline
        var axisStartValue =
          _rawData.data.length < MAXIMUM_VALUE_SPAN
            ? 0
            : _rawData.data.length - MAXIMUM_VALUE_SPAN;
        var axisEndValue =
          _rawData.data.length < MAXIMUM_VALUE_SPAN
            ? MAXIMUM_VALUE_SPAN
            : _rawData.data.length;
        var holidayDate = new Date();
        if (!sameDay(markline, holidayDate)) {
          markline.setDate(markline.getDate() - 1);
          markline.setHours(23, 59, 59, 0);
        }

        return {
          tooltip: {
            show: false,
          },
          animation: false,
          dataZoom: [
            {
              type: "slider",
              yAxisIndex: 0,
              zoomLock: true,
              width: 10,
              right: 10,
              top: 70,
              bottom: 20,
              handleSize: 0,
              showDetail: false,
              filterMode: "weakFilter",
              maxValueSpan: MAXIMUM_VALUE_SPAN,
              startValue: axisStartValue,
              endValue: axisEndValue,
            },
          ],
          graphic: {
            elements: [
              {
                type: "group",
                left: 120,
                top: "50",
                children: [
                  {
                    type: "text",
                    z: 100,
                    left: "center",
                    top: "middle",
                    style: {
                      fill: "#696969",
                      width: 100,
                      font: "normal 14px Helvetica",
                      overflow: "break",
                      text: "Auftrag",
                    },
                  },
                ],
              },
              {
                type: "group",
                left: 205,
                top: 60,
                children: [
                  {
                    type: "rect",
                    x: 0,
                    shape: {
                      x: 0,
                      y: 0,
                      width: 1,
                      height: 100000,
                    },
                    style: {
                      fill: "#000000",
                    },
                  },
                ],
              },
              {
                type: "group",
                left: 225,
                top: "50",
                children: [
                  {
                    type: "text",
                    z: 100,
                    left: "center",
                    top: "middle",
                    style: {
                      fill: "#696969",
                      font: "normal 14px Helvetica",
                      width: 100,
                      overflow: "break",
                      text: "Verleibende Auftragsdauer",
                    },
                  },
                ],
              },
              {
                type: "group",
                left: 330,
                top: 60,
                children: [
                  {
                    type: "rect",
                    x: 0,
                    shape: {
                      x: 0,
                      y: 0,
                      width: 1,
                      height: 100000,
                    },
                    style: {
                      fill: "#000000",
                    },
                  },
                ],
              },
              {
                type: "group",
                left: 350,
                top: "50",
                children: [
                  {
                    type: "text",
                    z: 100,
                    left: "center",
                    top: "middle",
                    style: {
                      fill: "#696969",
                      font: "normal 14px Helvetica",
                      width: 100,
                      overflow: "break",
                      text: "Puffer",
                    },
                  },
                ],
              },
            ],
          },
          grid: {
            show: true,
            top: 70,
            bottom: 70,
            left: 470,
            right: 20,
            backgroundColor: "#fff",
            borderWidth: 0,
          },
          xAxis: {
            type: "time",
            position: "top",
            min: function (value) {
              let d = new Date();
              if (d.getDay() === 1) {
                d.setDate(d.getDate() - 5);
              } else if (d.getDay() === 2) {
                d.setDate(d.getDate() - 5);
              } else if (d.getDay() === 3) {
                d.setDate(d.getDate() - 5);
              } else {
                d.setDate(d.getDate() - 3);
              }
              d.setHours(0, 0, 0, 0);
              return d;
            },
            max: function (value) {
              let d = new Date();
              d.setDate(d.getDate() + 5);
              d.setHours(0, 0, 0, 0);
              return d;
            },
            splitNumber: NUMBER_OF_SPLITS, // Should be made dynamic if the number of days to be displayed changes
            splitLine: {
              show: true,
              lineStyle: {
                color: ["#E9EDFF"],
              },
            },
            axisLine: {
              show: true,
            },
            axisTick: {
              lineStyle: {
                color: "#929ABA",
              },
            },
            axisLabel: {
              inside: false,
              align: "center",
              formatter: "{dd}-{MMM}",
              fontSize: 16,
            },
          },
          yAxis: {
            axisTick: { show: false },
            splitLine: { show: false },
            axisLine: { show: false },
            axisLabel: { show: false },
            min: 0,
            max: _rawData.data.length,
          },
          series: [
            {
              id: "orderData",
              type: "custom",
              renderItem: renderBar,

              dimensions: [
                null,
                null,
                null,
                null,
                { type: "ordinal" },
                null,
                null,
                null,
                null,
                null,
                null,
                null,
              ],
              encode: {
                x: [DIM_TIME_START, DIM_TIME_END],
                y: DIM_CATEGORY_INDEX,
                tooltip: [DIM_CATEGORY_INDEX, DIM_TIME_START, DIM_TIME_END],
              },
              data: _rawData.data,
              markLine: {
                silent: true,
                symbol: "none",
                symbolSize: [20, 20],
                label: {
                  normal: {
                    show: false,
                  },
                },
                lineStyle: {
                  color: "rgba(192, 39, 1, 0.8)",
                  width: 2,
                },
                data: [
                  {
                    xAxis: markline,
                  },
                ],
              },
              markArea: {
                silent: true,
                itemStyle: {
                  color: "rgba(230, 230, 230, 0.8)",
                },
                data: holidayMarkArea,
              },
            },
            {
              type: "custom",
              renderItem: renderLabel,
              dimensions: _rawData.data,
              encode: {
                x: -1,
                y: 0,
              },
              data: _rawData.data,
            },
          ],
        };
      }

      function renderBar(params, api) {
        var categoryIndex = api.value(DIM_CATEGORY_INDEX);
        var timestampStart = api.coord([
          api.value(DIM_TIME_START),
          categoryIndex,
        ]);
        var timestampEnd = api.coord([api.value(DIM_TIME_END), categoryIndex]);
        var timestampProgress = api.coord([
          api.value(DIM_TIME_PROGRESS),
          categoryIndex,
        ]);

        var barLength = timestampEnd[0] - timestampStart[0];
        var barLengthDelta = timestampProgress[0] - timestampStart[0];

        var barHeight = 30;
        var x = timestampStart[0];
        var y = timestampStart[1] - barHeight;
        var barDescription = api.value(DIM_WORKCENTER).toString() + " ";
        var barDescriptionWidth =
          echarts.format.getTextRect(barDescription).width;
        var text = barLength > barDescriptionWidth + 30 ? barDescription : "";
        var rectNormal = overLap(params, {
          x: x,
          y: y,
          width: barLength,
          height: barHeight,
        });

        var rectDelta = overLap(params, {
          x: x,
          y: y,
          width: barLengthDelta,
          height: barHeight,
        });

        var rectText = overLap(params, {
          x: x,
          y: y,
          width: barLength,
          height: barHeight,
        });

        var statusColor;
        switch (api.value(DIM_COLOR)) {
          case "GREEN":
            statusColor = "#0e8f33";
            break;
          case "RED":
            statusColor = "#941403";
            break;
          case "GREY":
            statusColor = "#a3a3a3";
            break;
        }
        return {
          type: "group",
          children: [
            {
              type: "rect",
              ignore: !rectNormal,
              shape: rectNormal,
              style: api.style({ fill: "#a3a3a3" }),
            },
            {
              type: "rect",
              ignore: !rectDelta,
              shape: rectDelta,
              style: api.style({ fill: statusColor }),
            },
            {
              type: "rect",
              ignore: !rectText,
              shape: rectText,
              style: api.style({
                fill: "transparent",
                stroke: "transparent",
                text: text,
                textFill: "#fff",
                fontFamily: "Helvetica",
                fontSize: 14,
              }),
            },
          ],
        };
      }

      function renderLabel(params, api) {
        var statusColor = api.value(DIM_BUFFER) > 0 ? "Green" : "Red";
        var y = api.coord([0, api.value(0)])[1];
        if (y < params.coordSys.y + 5) {
          return;
        }
        return {
          type: "group",
          position: [0, y],
          children: [
            {
              type: "text",
              style: {
                x: 50,
                y: -3,
                text: api.value(DIM_ORDER_NUMBER) + " ",
                textVerticalAlign: "bottom",
                textAlign: "left",
                font: "bold 14px Helvetica",
              },
            },
            {
              type: "text",
              style: {
                x: 250,
                y: -3,
                text: api.value(DIM_CURRENT_ACTIVITY_TIME) + " mins",
                textVerticalAlign: "bottom",
                textAlign: "center",
                font: "normal 14px Helvetica",
              },
            },
            {
              type: "text",
              style: {
                x: 375,
                y: -3,
                text: api.value(DIM_BUFFER) + " mins",
                textVerticalAlign: "bottom",
                textAlign: "center",
                textFill: statusColor,
                font: "normal 14px Helvetica",
              },
            },
          ],
        };
      }

      function overLap(params, rect) {
        return echarts.graphic.clipRectByRect(rect, {
          x: params.coordSys.x,
          y: params.coordSys.y,
          width: params.coordSys.width,
          height: params.coordSys.height,
        });
      }

      function getAdjustedTime(dateValue) {
        let d = new Date(dateValue);
        let hours = d.getHours();
        hours = hours < 7 ? 0 : Math.abs(7 - hours); // Use a configuration parameter before going live
        let minutes = d.getMinutes();
        let decimalTimeString = (2.66666 * hours + minutes / 60).toFixed();
        var n = new Date(dateValue);
        n.setHours(0, 0, 0, 0);
        n.setSeconds(+decimalTimeString * 60 * 60);
        return n;
      }

      function sameDay(d1, d2) {
        return (
          d1.getFullYear() === d2.getFullYear() &&
          d1.getMonth() === d2.getMonth() &&
          d1.getDate() === d2.getDate()
        );
      }

      function getUpcomingHolidays(holidayString) {
     //   holidayString = "20241231,20241230,20241227,20241226,20240626,20240709"; //REMOVE !!!
        const holidays = holidayString.split(",");
        var upcomingHolidays = [];
        holidays.forEach((holiday) => {
          upcomingHolidays.push(yyyymmddhhmmssToDate(holiday + "000000"));
        });
        upcomingHolidays = upcomingHolidays.concat(
          getUpcomingWeekends(CHECK_NUMBER_OF_DAYS_FOR_WEEKENDS)
        );
        return upcomingHolidays;
      }

      function getUpcomingWeekends(days) {
        var weekends = [];
        var offsetDays = -1 * days;
        do {
          var day = new Date();
          day = new Date(day.setDate(day.getDate() + offsetDays));
          if (day.getDay() === 6) {
            var [satFrom, sunFrom] = [new Date(), new Date()];
            satFrom = new Date(satFrom.setDate(satFrom.getDate() + offsetDays));
            satFrom = new Date(satFrom.setHours(0, 0, 0));
            sunFrom = new Date(
              sunFrom.setDate(sunFrom.getDate() + 1 + offsetDays)
            );
            sunFrom = new Date(sunFrom.setHours(0, 0, 0));
            weekends.push(satFrom, sunFrom);
          }
          offsetDays++;
        } while (offsetDays <= days);
        return weekends;
      }

      function getHolidayMarkArea(holidays) {
        var holidayMarkArea = [];
        holidays.forEach((holiday, index) => {
          var [day, dayFrom, dayTo] = [[], new Date(), new Date()];
          dayFrom = new Date(holiday.setHours(0, 0, 0));
          dayTo = new Date(holiday.setHours(23, 59, 59));
          day.push(
            {
              xAxis: dayFrom,
            },
            {
              xAxis: dayTo,
            }
          );
          holidayMarkArea.push(day);
        });
        return holidayMarkArea;
      }

      function countNumberOfHolidaysBetween(holidaysList, startDate, endDate) {
        let start = new Date(startDate);
        let end = new Date(endDate);
        let count = 0;
        holidaysList.forEach((dateStr) => {
          let holidayDate = new Date(dateStr);
          if (holidayDate >= start && holidayDate <= end) {
            count++;
          }
        });
        return count;
      }
      function yyyymmddhhmmssToDate(yyyymmddhhmmss) {
        const year = parseInt(yyyymmddhhmmss.substring(0, 4));
        const month = parseInt(yyyymmddhhmmss.substring(4, 6)) - 1;
        const day = parseInt(yyyymmddhhmmss.substring(6, 8));
        const hour = parseInt(yyyymmddhhmmss.substring(8, 10));
        const minute = parseInt(yyyymmddhhmmss.substring(10, 12));
        const second = parseInt(yyyymmddhhmmss.substring(12, 14));
        return new Date(year, month, day, hour, minute, second);
      }
    }
  }
  customElements.define("com-zdp-gantt_chart", generateGanttChart);
})();
