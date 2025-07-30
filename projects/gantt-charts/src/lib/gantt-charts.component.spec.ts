import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GanttChartsComponent } from './gantt-charts.component';

describe('GanttChartsComponent', () => {
  let component: GanttChartsComponent;
  let fixture: ComponentFixture<GanttChartsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [GanttChartsComponent]
    });
    fixture = TestBed.createComponent(GanttChartsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
