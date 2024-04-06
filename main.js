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
      const dataBinding = this.dataBinding;
      if (!dataBinding || dataBinding.state !== "success") {
        return;
      }

      await getScriptPromisify(
        "https://cdn.staticfile.org/echarts/5.0.0/echarts.min.js"
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

      aData.data.forEach((row, index) => {
        row[0] = index;
      });
      console.log(aData);

      /*-------------------------------------Chart related customizations---------------------------------------*/

      const myChart = echarts.init(this._root, "main");
      let option;

      var DIM_CATEGORY_INDEX = 0; //Index field used as an internal identifier
      var DIM_TIME_START = 2; // Index of the field which has the planned start timestamp
      var DIM_TIME_END = 3; // Index of the field which has the planned end timestamp
      var DIM_TIME_PROGRESS = 6; // Index of the field which depicts Absolute Progress Timestamp
      var maximumValueSpan = 15;
      var _rawData;

      _rawData = aData;
      myChart.setOption((option = generateOptions()));

      function generateOptions() {
        var markline = _rawData.data[0][10]; // Now Timestamp Markline
        var axisStartValue =
          _rawData.data.length < maximumValueSpan
            ? 0
            : _rawData.data.length - maximumValueSpan;
        var axisEndValue =
          _rawData.data.length < maximumValueSpan
            ? maximumValueSpan
            : _rawData.data.length;
        var currentDate = new Date();
        if (!sameDay(markline, currentDate)) {
          markline.setDate(markline.getDate() - 1);
          markline.setHours(23, 59, 59, 0);
        }

        var weekendMarkArea = getUpcomingWeekends(10);

        return {
          tooltip: {
            show: false,
            /* Commenting the code below as this feature will be shipped with v2 */
            // trigger: "item",
            // axisPointer: {
            //   type: "shadow",
            // },
            // formatter: function (params) {
            //   var startDateTime = echarts.format.formatTime(
            //     "dd-MM-yyyy hh:mm",
            //     params.data[2]
            //   );
            //   var endDateTime = echarts.format.formatTime(
            //     "dd-MM-yyyy hh:mm",
            //     params.data[3]
            //   );
            //   var line1 = `<span style="border-left: 2px solid #fff;display: inline-block;height: 12px;margin-right: 5px;">Start Date </span>`;
            //   var line2 = `</br><span style="border-left: 2px solid #fff;display: inline-block;height: 12px;margin-right: 5px;">End Date </span>`;
            //   return `${line1} ${startDateTime}
            //             ${line2} ${endDateTime}`;
            // },
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
              maxValueSpan: maximumValueSpan,
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
                      fill: "#333",
                      width: 100,
                      font: "bolder 12px Microsoft YaHei",
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
                      fill: "#333",
                      font: "bolder 12px Microsoft YaHei",
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
                      fill: "#333",
                      font: "bolder 12px Microsoft YaHei",
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
              d.setDate(d.getDate() - 1);
              d.setHours(0, 0, 0, 0);
              return d;
            },
            max: function (value) {
              let d = new Date();
              d.setDate(d.getDate() + 5);
              d.setHours(0, 0, 0, 0);
              return d;
            },
            splitNumber: 8, // Should be made dynamic if the number of days to be displayed changes
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
              dimensions: _rawData.data,
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
                data: weekendMarkArea,
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
        var barDescription = "Work Center: " + api.value(4);
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
        switch (api.value(9)) {
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
              }),
            },
          ],
        };
      }
      function renderLabel(params, api) {
        var statusColor = api.value(8) > 0 ? "Green" : "Red";
        var y = api.coord([0, api.value(0)])[1];
        if (y < params.coordSys.y + 5) {
          return;
        }
        return {
          type: "group",
          position: [0, y],
          children: [
            // {
            //   type: "path",
            //   shape: {
            //     d: "M 0 0 L 0 -20 L 30 -20 C 34 -20 30 -20 34 -20 L 34 0 L 70 0 Z",
            //     x: 0,
            //     y: -20,
            //     width: 350,
            //     height: 23,
            //     layout: "cover",
            //   },
            //   style: {
            //     fill: "black",
            //   },
            // },
            {
              type: "text",
              style: {
                x: 50,
                y: -3,
                text: api.value(1) + " ",
                textVerticalAlign: "bottom",
                textAlign: "left",
                font: "bolder 12px Microsoft YaHei",
              },
            },
            {
              type: "text",
              style: {
                x: 250,
                y: -3,
                text: api.value(5) + " mins",
                textVerticalAlign: "bottom",
                textAlign: "center",
              },
            },
            {
              type: "text",
              style: {
                x: 375,
                y: -3,
                text: api.value(8) + " mins",
                textVerticalAlign: "bottom",
                textAlign: "center",
                textFill: statusColor,
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
      function getUpcomingWeekends(days) {
        var weekendMarkArea = [];
        var offsetDays = -1 * days;
        do {
          var day = new Date();
          day = new Date(day.setDate(day.getDate() + offsetDays));
          if (day.getDay() === 6) {
            var sat = [];
            var sun = [];
            var [sunTo, sunFrom, satTo, satFrom] = [
              new Date(),
              new Date(),
              new Date(),
              new Date(),
            ];
            satFrom = new Date(satFrom.setDate(satFrom.getDate() + offsetDays));
            satFrom = new Date(satFrom.setHours(0, 0, 0));

            satTo = new Date(satTo.setDate(satTo.getDate() + offsetDays));
            satTo = new Date(satTo.setHours(23, 59, 59));

            sunFrom = new Date(
              sunFrom.setDate(sunFrom.getDate() + 1 + offsetDays)
            );
            sunFrom = new Date(sunFrom.setHours(0, 0, 0));

            sunTo = new Date(sunTo.setDate(sunTo.getDate() + 1 + offsetDays));
            sunTo = new Date(sunTo.setHours(23, 59, 59));

            sat.push(
              {
                xAxis: satFrom,
              },
              {
                xAxis: satTo,
              }
            );
            weekendMarkArea.push(sat);

            sun.push(
              {
                xAxis: sunFrom,
              },
              {
                xAxis: sunTo,
              }
            );
            weekendMarkArea.push(sun);
          }
          offsetDays++;
        } while (offsetDays <= days);
        return weekendMarkArea;
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
