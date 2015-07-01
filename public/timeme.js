// Filename: public/timeme.js

angular.module('TimeMeApp', [])
.controller('timeMeCtrl', ['$scope', '$http', function($scope, $http) {
  $scope.phonenumber = '';
  $scope.requestid = null;
  $scope.isLoggedIn = false;
  $scope.tasks = [];

  $scope.getTasks = function() {
    $http.get('/api/tasks').then(function(response) {
      if(response.data.error) {
        $scope.isLoggedIn = false;
        return;
      }
      
      $scope.tasks = response.data;
    });  
  }

  $scope.verify = function() {
    $http.get('/api/verify?number='+$scope.phonenumber).then(function(response) {
      if(response.data.error) {
        alert('Unable to verify number: '+response.data.error);
        return;
      }

      $scope.requestid = response.data.requestid;
    });
  }

  $scope.check = function() {
    $http.post('/api/check?requestid='+$scope.requestid+'&code='+$scope.code).then(function(response) {
      if(response.data.error) {
        alert('Unable to verify number: '+response.data.error);
        return;
      }

      $scope.isLoggedIn = true;
      $scope.getTasks();
    });
  }

  $scope.logout = function() {
    $http.get('/api/logout').then(function() {
      $scope.isLoggedIn = false;
      $scope.tasks = [];
      $scope.phonenumber = '';
      $scope.code = '';
    });
  }

  $scope.elapsedTime = function(elapsedTime) {
    var pad = function(num, size) {
      var s = num+"";
      while (s.length < size) s = "0" + s;
      return s;
    }

    var elapseTimeSeconds = elapsedTime/1000;

    return pad(Math.floor(elapseTimeSeconds/86400),2)+':'+
           pad(Math.floor((elapseTimeSeconds%86400)/3600),2)+':'+
           pad(Math.floor((elapseTimeSeconds%3600)/60),2)+':'+
           pad(Math.floor(elapseTimeSeconds%60),2);
  }

  $http.get('/api/me').then(function(response) {
    if(response.data.error) {
        $scope.isLoggedIn = false;
        return;
    }

    $scope.phonenumber = response.data.number;
    $scope.isLoggedIn = true;
    $scope.getTasks();
  });
}]);