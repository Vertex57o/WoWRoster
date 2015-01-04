(function (angular) {
    var app = angular.module('ArmoryControllers', []);

    app.controller("ArmorySearchController", ['$scope', '$rootScope', 'ArmoryService', 'usSpinnerService', function ($scope, $rootScope, ArmoryService, usSpinnerService) {

        $scope.regions = [
            {label: 'US', value: 'us'},
            {label: 'Europe', value: 'eu'},
            {label: 'Korea', value: 'kr'},
            {label: 'Taiwan', value: 'tw'}
        ];

        $scope.findInStorage = function (storageKey) {
            if (typeof(Storage) !== "undefined") {
                return localStorage.getItem(storageKey);
            }
            return null;
        };

        $scope.realmsCache = {};
        $scope.realms = [];

        $scope.region = $scope.findInStorage("wow-roster-region");
        $scope.$watch('region', function (newRegion) {
            if (newRegion) {
                ArmoryService.setRegion(newRegion);
                $scope.fetchRealms();
            }
        });
        $scope.realm = $scope.findInStorage("wow-roster-realm");
        $scope.$watch('realm', function (newRealm) {
            if (newRealm) {
                ArmoryService.setRealm(newRealm);
            }
        });

        $scope.guildName = $scope.findInStorage("wow-roster-guild-name");
        $scope.$watch('guildName', function (newGuildName) {
            ArmoryService.setGuildName(newGuildName);
        });

        $scope.fetchRealms = function () {
            usSpinnerService.spin('armory-config-spinner');
            if ($scope.realmsCache[ArmoryService.getRegion()] == null) {
                ArmoryService.getRealms(ArmoryService.getRegion())
                    .success(function (data) {
                        storeRealms(data, ArmoryService.getRegion());
                        usSpinnerService.stop('armory-config-spinner');
                    }).error(function (data, status, headers, config, statusText) {
                        AlertService.addAlert('danger', ArmoryService.asError(status, statusText));
                        usSpinnerService.stop('armory-config-spinner');
                    });
            } else {
                // Use realms in cache
                $scope.realms = $scope.realmsCache[$scope.region];
            }

            function storeRealms(data, region) {
                $scope.realmsCache[region] = [];
                angular.forEach(data.realms, function (value) {
                    var realm = {
                        value: value.name,
                        label: value.name + ' (' + value.type.toUpperCase() + ')'
                    };
                    $scope.realmsCache[region].push(realm);
                    $scope.realms = $scope.realmsCache[region];
                });
            }
        };

        $scope.notifyFetchCharacters = function () {
            $rootScope.$broadcast('fetch-characters');
        }
    }]);

    app.controller("GuildController", ['$scope', 'ArmoryService', 'AlertService', 'DataService', 'usSpinnerService', '$filter',
        function ($scope, ArmoryService, AlertService, DataService, usSpinnerService, $filter) {

            // Pagination
            $scope.currentPage = 1;
            $scope.pageSize = 10;

            $scope.guildName = null;
            $scope.maxLevelOnly = true;

            // Init
            $scope.classes = [];
            $scope.specializations = [];
            var classes = DataService.getClasses();
            for (var index in classes) {
                $scope.classes.push(classes[index].name);
                var classSpecs = classes[index].specialization;
                for (var wowClass in classSpecs) {
                    $scope.specializations.push(wowClass);
                }
            }

            // Members
            $scope.characters = [];

            $scope.getFilteredCharacters = function () {
                var sortedCharacters = $filter('orderBy')($scope.characters, 'name');
                if ($scope.maxLevelOnly) {
                    sortedCharacters = $filter('filter')(sortedCharacters, {level: 100});
                }
                return sortedCharacters;
            };

            $scope.getCharacterCount = function () {
                return $scope.getFilteredCharacters().length;
            };

            $scope.$on('fetch-characters', function () {
                $scope.fetchCharacters();
            });

            $scope.fetchCharacters = function () {
                $scope.lastError = null;
                $scope.characters = [];

                if (ArmoryService.getRegion().trim() == '' || ArmoryService.getRealm().trim() == '' || ArmoryService.getGuildName().trim() == '') {
                    AlertService.addAlert('warning', 'You have to fill all three fields');
                } else {
                    usSpinnerService.spin('armory-config-spinner');
                    ArmoryService.getCharacters()
                        .success(function (data) {
                            // Convert to a character list
                            storeCharacters(data);
                            // Save these new correct values
                            ArmoryService.saveInStorage();
                            $scope.guildName = ArmoryService.getRealm() + "/" + ArmoryService.getGuildName();
                            usSpinnerService.stop('armory-config-spinner');
                        }).error(function (data, status, headers, config, statusText) {
                            if (status == "404") {
                                AlertService.addAlert('warning', 'No guild named ' + ArmoryService.getGuildName()
                                + ' was found on ' + ArmoryService.getRealm() + '(' + ArmoryService.getRegion() + ')');
                            } else {
                                AlertService.addAlert('danger', ArmoryService.asError(status, statusText));
                            }
                            usSpinnerService.stop('armory-config-spinner');
                        });
                    function storeCharacters(data) {
                        angular.forEach(data.members, function (value) {
                            var member = {
                                name: value.character.name,
                                level: value.character.level,
                                spec: !value.character.spec ? null : value.character.spec.name,
                                role: !value.character.spec ? null : value.character.spec.role,
                                wowClass: classes[value.character.class],
                                classLabel: classes[value.character.class].name
                            };
                            $scope.characters.push(member);
                        });
                    }
                }
            };

            // Roster
            $scope.roster = {};
            $scope.rosterCount = 0;
            $scope.roles = DataService.getRoles();

            // Buffs
            $scope.buffs = DataService.getBuffs();
            $scope.availableBuffs = {};

            $scope.getRosterData = function () {
                var armorData = [{"label": "Plate", "value": 0},
                    {"label": "Mail", "value": 0},
                    {"label": "Leather", "value": 0},
                    {"label": "Cloth", "value": 0}];
                var classData = [];
                for (index in classes) {
                    classData.push({
                        label: classes[index].name,
                        value: 0,
                        color: classes[index].color
                    });
                }

                for (var role in $scope.roster) {
                    for (var index in $scope.roster[role]) {
                        var member = $scope.roster[role][index];

                        for (var armorIndex in armorData) {
                            if (armorData[armorIndex].label == member.wowClass.armor) {
                                armorData[armorIndex].value++;
                            }
                        }
                        for (var classIndex in classData) {
                            if (classData[classIndex].label == member.wowClass.name) {
                                classData[classIndex].value++;
                            }
                        }
                    }
                }
                return {
                    armorData: armorData,
                    classData: classData
                };
            };

            var armorDonut = null;
            var classDonut = null;
            $scope.$watch('rosterCount', function () {
                setTimeout(function () { //Using a timeout to prevent a bug : morris doesn't like to be used on hidden DOM...
                    if ($scope.rosterCount > 0) {
                        var rosterData = $scope.getRosterData();
                        if (!armorDonut && !classDonut) {
                            armorDonut = Morris.Donut({
                                element: 'armor-donut',
                                data: rosterData.armorData,
                                colors: ["#F8BD7F", "#D79F64", "#825322", "#5F3406"],
                                resize: true
                            });
                            classDonut = Morris.Donut({
                                element: 'class-donut',
                                data: rosterData.classData,
                                resize: true
                            });
                        } else {
                            armorDonut.setData(rosterData.armorData);
                            classDonut.setData(rosterData.classData);
                        }
                    }
                }, 200);
            });

            $scope.getCount = function (role) {
                if ($scope.roster[role.id]) {
                    return $scope.roster[role.id].length;
                }
                return 0;
            };

            $scope.getTankCount = function() {
                return $scope.getCount($scope.roles.Tank);
            };

            $scope.validHealerCount = function() {
                this.getHealerCount = function() {
                    return $scope.getCount($scope.roles.Heal);
                };

                this.getNonHealerCount = function() {
                    return $scope.rosterCount - $scope.getHealerCount();
                };

                return $scope.rosterCount > 0 && this.getHealerCount() >= 1
                    && this.getHealerCount() * 4 >= this.getNonHealerCount()
                    && (this.getHealerCount()-1) * 4 < this.getNonHealerCount();
            };

            $scope.get = function (role) {
                return $scope.roster[role.id];
            };

            function updateBuff(memberSpec) {
                if (memberSpec.buffs) {
                    // 0 = Missing. 0,5 = Available, but exclusive. 1+ = Available
                    var processedExclusiveBuffs = [];
                    for (var index in memberSpec.buffs) {
                        var buffDef = memberSpec.buffs[index];
                        // If this buff was not already handled as an exclusive buff
                        if ($.inArray(buffDef.buff.id, processedExclusiveBuffs) == -1) {
                            // If the buff is not yet initialized
                            if (!$scope.availableBuffs[buffDef.buff.id]) {
                                $scope.availableBuffs[buffDef.buff.id] = {
                                    buff: buffDef.buff, count: 0
                                };
                            }
                            if (buffDef.exclusive) {
                                // Only one of these two buff is actually available. Raid leader has to choose
                                var currentBuffStatus = $scope.availableBuffs[buffDef.buff.id];

                                var otherBuff = buffDef.exclusive;
                                // Init the other buff
                                if (!$scope.availableBuffs[otherBuff.id]) {
                                    $scope.availableBuffs[otherBuff.id] = {
                                        buff: otherBuff, count: 0
                                    };
                                }
                                var otherBuffStatus = $scope.availableBuffs[otherBuff.id];

                                var count;
                                var otherCount;
                                if (currentBuffStatus.count >= 1 && otherBuffStatus.count >= 1) { //Both already available
                                    count = 0.5;
                                    otherCount = 0.5;
                                } else if (otherBuffStatus.count >= 1) { //Only the other is available
                                    count = 1;
                                    otherCount = 0.5;
                                } else if (currentBuffStatus.count >= 1) { // This one is available
                                    count = 0.5;
                                    otherCount = 1;
                                } else { //None available
                                    count = 0.5;
                                    otherCount = 0.5;
                                }
                                currentBuffStatus.count += count;
                                currentBuffStatus.exclusive = buffDef.exclusive;
                                otherBuffStatus.count += otherCount; // Mark the other too

                                processedExclusiveBuffs.push(otherBuff.id);
                            } else {
                                // Buff is simply available
                                var currentBuffStatus = $scope.availableBuffs[buffDef.buff.id];
                                if (currentBuffStatus.count == 0.5) {
                                    // This buff will be available, so we may also set the other exclusive buff to available
                                    var exclusiveBuffStatus = $scope.availableBuffs[currentBuffStatus.exclusive.id];
                                    exclusiveBuffStatus.count += 0.5;
                                }
                                currentBuffStatus.count += 1;
                            }
                            processedExclusiveBuffs.push(buffDef.buff.id);
                        } else {
                            // This buff is (probably) exclusive, so only add the link ,the counter has already been updated
                            if (buffDef.exclusive) {
                                var currentBuffStatus = $scope.availableBuffs[buffDef.buff.id];
                                currentBuffStatus.exclusive = buffDef.exclusive;
                            }
                        }
                    }
                }
            }

            $scope.addToRoster = function (member) {
                // Find the current specialization
                var memberClass = member.wowClass;
                var memberSpec = memberClass.specialization[member.spec];
                if (memberSpec) {
                    // Add to the matching role in the roster
                    var memberRole = memberSpec.role.id;
                    if (!$scope.roster[memberRole]) {
                        $scope.roster[memberRole] = [];
                    }
                    $scope.roster[memberRole].push(member);
                    $scope.rosterCount++;

                    // Check for new buffs
                    updateBuff(memberSpec);
                } else {
                    AlertService.addAlert('warning', 'This character (' + member.name + ') has no valid specialization');
                }
            };

            $scope.removeFromRoster = function (member) {
                var memberClass = member.wowClass;
                var memberSpec = memberClass.specialization[member.spec];
                var memberRole = memberSpec.role.id;
                $scope.roster[memberRole].splice($.inArray(member, $scope.roster[memberRole]), 1);
                $scope.rosterCount--;

                $scope.availableBuffs = {};
                // Instead of trying to computer all counts and following all exclusive links, we just recompute from scratch.
                // The code is much more easy, buf-free, but a bit more costly to execute. For a full roster (30 members),
                // and an average of ~3 buff/ member, that's still less than 100 values to process.
                for (var curRole in $scope.roster) {
                    for (var index in $scope.roster[curRole]) {
                        var curMember = $scope.roster[curRole][index];
                        var curMemberClass = curMember.wowClass;
                        var curMemberSpec = curMemberClass.specialization[curMember.spec];
                        updateBuff(curMemberSpec);
                    }
                }

            };

            $scope.hasBeenAddedToRoster = function (member) {
                var memberClass = member.wowClass;
                var memberSpec = memberClass.specialization[member.spec];
                if (memberSpec) {
                    if (!memberSpec.role) {
                        console.log(memberSpec + " is invalid");
                    }
                    var memberRole = memberSpec.role.id;
                    if ($scope.roster[memberRole]) {
                        var matches = $filter('filter')($scope.roster[memberRole], {name: member.name});
                        return matches.length > 0;
                    }

                }
                return false;
            };

            $scope.isBuffAvailable = function (buff) {
                return $scope.availableBuffs[buff.id] && $scope.availableBuffs[buff.id].count > 0.5;
            };

            $scope.isBuffMissing = function (buff) {
                return !$scope.availableBuffs[buff.id] || $scope.availableBuffs[buff.id].count == 0.0;
            };

            $scope.isBuffExclusiveAvailable = function (buff) {
                return $scope.availableBuffs[buff.id] && $scope.availableBuffs[buff.id].count == 0.5;
            };

            $scope.clearRoster = function () {
                $scope.roster = [];
                $scope.rosterCount = 0;
                $scope.availableBuffs = {};
            }
        }]);

    app.controller('WarningController', ['$scope', 'AlertService', function ($scope, AlertService) {

        this.getAlerts = function () {
            return AlertService.getAlerts();
        };

        this.closeAlert = function (index) {
            AlertService.getAlerts().splice(index, 1);
        };
    }]);
})(angular);