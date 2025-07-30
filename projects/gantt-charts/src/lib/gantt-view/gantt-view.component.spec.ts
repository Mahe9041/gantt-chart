import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GanttViewComponent } from './gantt-view.component';

describe('GanttViewComponent', () => {
  let component: GanttViewComponent;
  let fixture: ComponentFixture<GanttViewComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [GanttViewComponent]
    });
    fixture = TestBed.createComponent(GanttViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
