import { TestBed } from '@angular/core/testing';

import { GanttChartsService } from './gantt-charts.service';

describe('GanttChartsService', () => {
  let service: GanttChartsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GanttChartsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
