import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { message: string; name: string } {
    return {
      name: 'aff-cms-api',
      message: 'Aff CMS API is running',
    };
  }
}
