import { NgModule } from '@angular/core';
import { GanttChartsComponent } from './gantt-charts.component';
import { GanttViewComponent } from './gantt-view/gantt-view.component';



@NgModule({
  declarations: [
    GanttChartsComponent,
    GanttViewComponent
  ],
  imports: [
  ],
  exports: [
    GanttChartsComponent
  ]
})
export class GanttChartsModule { }
