import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
  getHelloNew(): object {
    return {
      message: 'Hello NestJS',
      timestamp: new Date(),
    };
  }
}
