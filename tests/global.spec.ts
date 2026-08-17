import { testHomepageLoads } from '../dist/suites/global';

// Registering the suite and having it pass against a real dev site IS the test:
// a registrar's whole job is to register working tests.
testHomepageLoads();
